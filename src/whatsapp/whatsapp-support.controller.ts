import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { SupportConversationStatus, UserRole } from '@prisma/client';
import { StaffOrAdmin } from '../admin/_admin-guards';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSupportService } from './whatsapp-support.service';
import { maskPhone, redactSensitiveText } from './utils/redaction.util';
import { normalizeWhatsappLanguage } from './templates/whatsapp.templates';

class SupportConversationsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}

class SupportMessagesQueryDto extends PaginationDto {}

class SupportReplyDto {
  @IsOptional()
  @IsIn(['TEXT', 'TEMPLATE'])
  type?: 'TEXT' | 'TEMPLATE';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number | null | undefined>;
}

class SupportConversationUpdateDto {
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';

  @IsOptional()
  @IsString()
  assignedToId?: string;
}

@ApiTags('Admin/Support')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/support/whatsapp', version: ['1'] })
export class WhatsappSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: WhatsappSupportService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('conversations')
  async listConversations(@Query() query: SupportConversationsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 20;
    const statusFilter =
      query.status === 'CLOSED'
        ? SupportConversationStatus.RESOLVED
        : query.status === 'OPEN'
          ? SupportConversationStatus.OPEN
          : undefined;
    const result = await this.support.listConversations({
      search: query.search,
      status: statusFilter,
      assignedToId: query.assignedToId,
      page,
      pageSize,
    });
    const items = result.items;
    const conversationIds = items.map((item) => item.id);
    const inbound = conversationIds.length
      ? await this.prisma.supportMessage.groupBy({
          by: ['conversationId'],
          where: { conversationId: { in: conversationIds }, direction: 'INBOUND' },
          _max: { createdAt: true },
        })
      : [];
    const inboundMap = new Map(inbound.map((row) => [row.conversationId, row._max.createdAt]));
    const canViewPii = user.role === UserRole.ADMIN;
    const responseItems = items.map((conversation) => {
      const lastInboundAt = inboundMap.get(conversation.id) ?? null;
      const freeformUntil = lastInboundAt
        ? new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
        : null;
      const canReplyFreeform = freeformUntil ? Date.now() < freeformUntil.getTime() : false;
      const metadata =
        conversation.metadata && typeof conversation.metadata === 'object'
          ? (conversation.metadata as Record<string, unknown>)
          : {};
      const displayName =
        conversation.user?.name ??
        (typeof metadata.displayName === 'string' ? metadata.displayName : null) ??
        (typeof metadata.contactName === 'string' ? metadata.contactName : null) ??
        (typeof metadata.name === 'string' ? metadata.name : null) ??
        null;
      const participantType =
        conversation.user?.role === UserRole.PROVIDER || conversation.user?.role === UserRole.DRIVER
          ? 'PROVIDER'
          : conversation.user?.role === UserRole.CUSTOMER
            ? 'CUSTOMER'
            : 'UNKNOWN';
      const phone = conversation.phone;
      const maskedPhoneValue = maskPhone(phone);
      const shouldMask = !canViewPii;
      const safePhone = shouldMask ? maskedPhoneValue : phone;
      return {
        conversationId: conversation.id,
        phone: safePhone,
        maskedPhone: shouldMask ? maskedPhoneValue : null,
        displayName,
        participantType,
        lastMessagePreview: redactSensitiveText(conversation.lastMessagePreview ?? ''),
        lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
        status: conversation.status === 'RESOLVED' ? 'CLOSED' : 'OPEN',
        freeformUntil: freeformUntil ? freeformUntil.toISOString() : null,
        canReplyFreeform,
        metadata: {
          ...metadata,
          freeformUntil: freeformUntil ? freeformUntil.toISOString() : null,
          canReply: canReplyFreeform,
        },
      };
    });
    return { items: responseItems, total: result.total, page, pageSize };
  }

  @Get('conversations/:id/messages')
  async listMessages(@Param('id') id: string, @Query() query: SupportMessagesQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 20;
    const result = await this.support.listMessages(id, { page, pageSize });
    const messageIds = result.items.map((item) => item.id);
    const logs = messageIds.length
      ? await this.prisma.whatsAppMessageLog.findMany({
          where: { supportMessageId: { in: messageIds } },
        })
      : [];
    const logMap = new Map(logs.map((log) => [log.supportMessageId, log]));
    const items = result.items.map((message) => {
      const log = logMap.get(message.id);
      const payload = (log?.payload ?? {}) as Record<string, unknown>;
      const metadata =
        typeof payload.metadata === 'object' && payload.metadata
          ? (payload.metadata as Record<string, string | number | null | undefined>)
          : {};
      const deliveryStatus =
        message.direction === 'OUTBOUND' ? (log?.status ?? null) : null;
      const relatedOrderId = metadata.orderId ?? metadata.orderCode ?? null;
      return {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        messageType: message.messageType,
        body: redactSensitiveText(message.body ?? ''),
        createdAt: message.createdAt.toISOString(),
        deliveryStatus,
        providerMessageId: log?.providerMessageId ?? null,
        relatedOrderId,
        status: deliveryStatus,
      };
    });
    return { items, total: result.total, page, pageSize };
  }

  @Patch('conversations/:id')
  async updateConversation(@Param('id') id: string, @Body() dto: SupportConversationUpdateDto) {
    if (!dto.status && !dto.assignedToId) {
      return { success: true };
    }
    const mappedStatus =
      dto.status === 'CLOSED' ? SupportConversationStatus.RESOLVED : dto.status === 'OPEN' ? SupportConversationStatus.OPEN : undefined;
    const updated = await this.support.updateConversationStatus(id, mappedStatus, dto.assignedToId ?? null);
    return {
      conversationId: updated.id,
      status: updated.status === 'RESOLVED' ? 'CLOSED' : 'OPEN',
      assignedToId: updated.assignedToId,
    };
  }

  @Post('conversations/:id/reply')
  async reply(
    @Param('id') id: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const conversation = await this.prisma.supportConversation.findUnique({ where: { id } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const type =
      dto.type ??
      (dto.templateName || dto.template ? 'TEMPLATE' : 'TEXT');
    if (type === 'TEXT') {
      const body = (dto.text ?? dto.body ?? '').trim();
      if (!body) {
        throw new BadRequestException('Message body is required');
      }
      const lastInbound = await this.prisma.supportMessage.findFirst({
        where: { conversationId: conversation.id, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
      });
      const freeformUntil = lastInbound
        ? new Date(lastInbound.createdAt.getTime() + 24 * 60 * 60 * 1000)
        : null;
      if (!freeformUntil || Date.now() > freeformUntil.getTime()) {
        throw new BadRequestException({
          code: ErrorCode.FREEFORM_WINDOW_EXPIRED,
          message: 'Freeform window expired. Use a template.',
          details: { freeformUntil: freeformUntil ? freeformUntil.toISOString() : null },
        });
      }
      const message = await this.support.recordOutboundMessage({
        conversationId: conversation.id,
        body,
        agentId: user.userId,
        metadata: { source: 'admin' },
      });
      await this.whatsapp.sendText({
        to: conversation.phone,
        body,
        supportConversationId: conversation.id,
        supportMessageId: message.id,
        metadata: { source: 'admin' },
      });
      return { success: true, messageId: message.id };
    }

    const templateName = (dto.templateName ?? dto.template ?? '').trim();
    if (!templateName) {
      throw new BadRequestException('Template name is required');
    }
    const variables = dto.variables ?? {};
    const message = await this.support.recordOutboundMessage({
      conversationId: conversation.id,
      body: templateName,
      messageType: 'TEMPLATE',
      agentId: user.userId,
      metadata: { source: 'admin', templateName },
    });
    await this.whatsapp.sendTemplate({
      to: conversation.phone,
      template: templateName,
      language: normalizeWhatsappLanguage(dto.language),
      variables,
      supportConversationId: conversation.id,
      supportMessageId: message.id,
      metadata: { source: 'admin', templateName },
    });
    return { success: true, messageId: message.id };
  }

  @Post('conversations/:id/messages')
  async replyLegacy(
    @Param('id') id: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reply(id, dto, user);
  }
}
