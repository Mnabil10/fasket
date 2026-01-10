import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Prisma, WhatsAppMessageDirection, WhatsAppMessageStatus } from '@prisma/client';
import { StaffOrAdmin } from '../admin/_admin-guards';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeWhatsappLanguage } from './templates/whatsapp.templates';
import { WhatsappService } from './whatsapp.service';
import { maskPhone, redactSensitiveText } from './utils/redaction.util';

class WhatsappLogsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED'])
  status?: WhatsAppMessageStatus | string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND'])
  direction?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  order?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  supportConversationId?: string;

  @IsOptional()
  @IsString()
  supportMessageId?: string;
}

type WhatsappLogPayload = {
  template?: {
    name?: string;
    language?: string;
    variables?: Record<string, string | number | null | undefined>;
  };
  variables?: Record<string, string | number | null | undefined>;
  metadata?: Record<string, string | number | null | undefined>;
  text?: string;
  message?: string;
  document?: { link?: string; filename?: string };
  orderId?: string;
};

@ApiTags('Admin/WhatsApp')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/whatsapp', version: ['1'] })
export class WhatsappLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('logs')
  async list(@Query() query: WhatsappLogsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.WhatsAppMessageLogWhereInput = {};

    if (query.status) where.status = query.status as WhatsAppMessageStatus;
    if (query.direction) where.direction = query.direction as WhatsAppMessageDirection;
    if (query.supportConversationId) where.supportConversationId = query.supportConversationId;
    if (query.supportMessageId) where.supportMessageId = query.supportMessageId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const and: Prisma.WhatsAppMessageLogWhereInput[] = [];
    if (query.phone?.trim()) {
      const term = query.phone.trim();
      and.push({
        OR: [{ toPhone: { contains: term } }, { fromPhone: { contains: term } }],
      });
    }
    if (query.template?.trim()) {
      const term = query.template.trim();
      and.push({
        OR: [
          { templateName: { contains: term, mode: 'insensitive' } },
          { payload: { path: ['template', 'name'], string_contains: term } },
        ],
      });
    }
    if (query.order?.trim()) {
      const term = query.order.trim();
      and.push({
        OR: [
          { payload: { path: ['metadata', 'orderId'], string_contains: term } },
          { payload: { path: ['metadata', 'orderCode'], string_contains: term } },
          { payload: { path: ['orderId'], string_contains: term } },
          { payload: { path: ['template', 'variables', 'order_no'], string_contains: term } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsAppMessageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.whatsAppMessageLog.count({ where }),
    ]);

    const canViewPii = user.role === 'ADMIN';
    const responseItems = items.map((log) => {
      const payload = (log.payload ?? {}) as WhatsappLogPayload;
      const metadata = payload.metadata ?? {};
      const templateName = log.templateName ?? payload.template?.name ?? null;
      const phone = log.direction === 'INBOUND' ? log.fromPhone : log.toPhone;
      const maskedPhone = phone ? maskPhone(phone) : null;
      const relatedOrderId = metadata.orderId ?? metadata.orderCode ?? payload.orderId ?? null;
      const relatedEntityType = relatedOrderId ? 'order' : log.supportConversationId ? 'support' : null;
      const relatedEntityId = relatedOrderId ?? log.supportConversationId ?? null;
      const resendCheck = this.resolveResendability(log, templateName);
      return {
        id: log.id,
        direction: log.direction,
        phone: canViewPii ? phone : maskedPhone,
        maskedPhone: canViewPii ? null : maskedPhone,
        templateName,
        messageType: log.type,
        status: log.status,
        errorMessage: log.errorMessage ?? null,
        body: log.body ? redactSensitiveText(log.body) : null,
        createdAt: log.createdAt.toISOString(),
        relatedEntityType,
        relatedEntityId,
        supportConversationId: log.supportConversationId ?? null,
        supportMessageId: log.supportMessageId ?? null,
        canResend: resendCheck.canResend,
        resendAfterSeconds: resendCheck.resendAfterSeconds ?? undefined,
      };
    });

    return { items: responseItems, total, page, pageSize };
  }

  @Post('logs/:id/resend')
  async resend(@Param('id') id: string) {
    const log = await this.prisma.whatsAppMessageLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException('WhatsApp log not found');
    }
    const payload = (log.payload ?? {}) as WhatsappLogPayload;
    const templateName = log.templateName ?? payload.template?.name ?? null;
    const resendCheck = this.resolveResendability(log, templateName);
    if (!resendCheck.canResend) {
      throw new BadRequestException('Resend not available for this log');
    }

    const toPhone = log.toPhone ?? null;
    if (!toPhone) {
      throw new BadRequestException('Recipient phone is missing');
    }
    const baseMetadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const metadata = {
      ...baseMetadata,
      resendOf: log.id,
    } as Record<string, unknown>;

    if (log.type === 'TEXT') {
      const body = String(log.body ?? payload.text ?? payload.message ?? '').trim();
      if (!body) {
        throw new BadRequestException('Text payload missing');
      }
      const created = await this.whatsapp.sendText({
        to: toPhone,
        body,
        supportConversationId: log.supportConversationId ?? undefined,
        supportMessageId: log.supportMessageId ?? undefined,
        metadata,
      });
      return { success: true, id: created.id };
    }

    if (log.type === 'DOCUMENT') {
      const link = log.mediaUrl ?? payload.document?.link ?? null;
      if (!link) {
        throw new BadRequestException('Document payload missing');
      }
      const created = await this.whatsapp.sendDocument({
        to: toPhone,
        link,
        filename: payload.document?.filename ?? undefined,
        supportConversationId: log.supportConversationId ?? undefined,
        supportMessageId: log.supportMessageId ?? undefined,
        metadata,
      });
      return { success: true, id: created.id };
    }

    if (!templateName) {
      throw new BadRequestException('Template name missing');
    }
    const variables = (payload.template?.variables ?? payload.variables ?? {}) as Record<
      string,
      string | number | null | undefined
    >;
    const language = normalizeWhatsappLanguage(payload.template?.language ?? log.templateLanguage ?? undefined);
    const created = await this.whatsapp.sendTemplate({
      to: toPhone,
      template: templateName,
      language,
      variables,
      supportConversationId: log.supportConversationId ?? undefined,
      supportMessageId: log.supportMessageId ?? undefined,
      metadata,
    });
    return { success: true, id: created.id };
  }

  private resolveResendability(
    log: { direction: string; status: string },
    templateName: string | null,
  ): { canResend: boolean; resendAfterSeconds?: number } {
    if (log.direction !== 'OUTBOUND') return { canResend: false };
    if (templateName && ['otp_verification_v1', 'password_reset_v1'].includes(templateName)) {
      return { canResend: false };
    }
    return { canResend: log.status === 'FAILED' };
  }
}
