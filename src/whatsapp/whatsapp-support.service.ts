import { Injectable } from '@nestjs/common';
import { Prisma, SupportConversationStatus, SupportMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import { snippet } from './utils/redaction.util';

@Injectable()
export class WhatsappSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureConversation(params: {
    phone: string;
    userId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const normalizedPhone = normalizePhoneToE164(params.phone);
    return this.prisma.supportConversation.upsert({
      where: { channel_phone: { channel: 'WHATSAPP', phone: normalizedPhone } },
      update: {
        userId: params.userId ?? undefined,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      create: {
        channel: 'WHATSAPP',
        phone: normalizedPhone,
        userId: params.userId ?? undefined,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async recordInboundMessage(params: {
    phone: string;
    userId?: string | null;
    body?: string | null;
    externalId?: string | null;
    messageType?: SupportMessageType;
    metadata?: Record<string, unknown> | null;
  }) {
    const conversation = await this.ensureConversation({
      phone: params.phone,
      userId: params.userId ?? undefined,
      metadata: params.metadata ?? undefined,
    });

    if (params.externalId) {
      const existing = await this.prisma.supportMessage.findFirst({
        where: { externalId: params.externalId },
      });
      if (existing) {
        return { conversation, message: existing, duplicate: true };
      }
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        messageType: params.messageType ?? 'TEXT',
        body: params.body ?? undefined,
        externalId: params.externalId ?? undefined,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.supportConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: snippet(params.body ?? ''),
        status: 'OPEN',
      },
    });

    return { conversation, message, duplicate: false };
  }

  async recordOutboundMessage(params: {
    conversationId: string;
    body: string;
    agentId?: string | null;
    messageType?: SupportMessageType;
    metadata?: Record<string, unknown> | null;
  }) {
    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId: params.conversationId,
        direction: 'OUTBOUND',
        messageType: params.messageType ?? 'TEXT',
        body: params.body,
        agentId: params.agentId ?? undefined,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.supportConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: snippet(params.body ?? ''),
      },
    });

    return message;
  }

  async updateConversationStatus(
    conversationId: string,
    status?: SupportConversationStatus,
    assignedToId?: string | null,
  ) {
    const data: Prisma.SupportConversationUpdateInput = {};
    if (status) data.status = status;
    if (assignedToId !== undefined) {
      data.assignedTo = assignedToId
        ? { connect: { id: assignedToId } }
        : { disconnect: true };
    }
    return this.prisma.supportConversation.update({
      where: { id: conversationId },
      data,
    });
  }

  async listConversations(params: {
    search?: string;
    status?: SupportConversationStatus;
    assignedToId?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.SupportConversationWhereInput = {
      channel: 'WHATSAPP',
    };
    if (params.status) where.status = params.status;
    if (params.assignedToId) where.assignedToId = params.assignedToId;
    if (params.search) {
      where.OR = [
        { phone: { contains: params.search } },
        { lastMessagePreview: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportConversation.findMany({
        where,
        include: { user: { select: { name: true, role: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.supportConversation.count({ where }),
    ]);

    return { items, total };
  }

  async listMessages(conversationId: string, params: { page: number; pageSize: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.supportMessage.count({ where: { conversationId } }),
    ]);
    return { items, total };
  }
}
