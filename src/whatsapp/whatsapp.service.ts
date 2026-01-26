import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import {
  buildWhatsappTemplatePayloadDynamic,
  normalizeWhatsappLanguage,
  WhatsappTemplateKey,
  WhatsappTemplateLanguage,
} from './templates/whatsapp.templates';
import { WhatsappQueueJob, WhatsappProvider } from './whatsapp.types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: WhatsappProvider;
  private readonly providerLabel: 'META' | 'MOCK';
  private readonly defaultLanguage: WhatsappTemplateLanguage;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('whatsapp.send') @Optional() private readonly queue?: Queue<WhatsappQueueJob>,
  ) {
    this.provider = this.resolveProvider(this.config.get<string>('WHATSAPP_PROVIDER'));
    this.providerLabel = this.provider === 'mock' ? 'MOCK' : 'META';
    this.defaultLanguage = normalizeWhatsappLanguage(this.config.get<string>('WHATSAPP_DEFAULT_LANGUAGE'));
    this.enabled = (this.config.get<string>('WHATSAPP_ENABLED') ?? 'true') !== 'false';
  }

  async sendTemplate(params: {
    to: string;
    template: WhatsappTemplateKey | string;
    language?: WhatsappTemplateLanguage;
    variables: Record<string, string | number | null | undefined>;
    supportConversationId?: string;
    supportMessageId?: string;
    metadata?: Record<string, unknown>;
    sendAt?: string | Date | null;
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const language = normalizeWhatsappLanguage(params.language ?? this.defaultLanguage);
    const templateName = String(params.template).trim();
    const templatePayload = buildWhatsappTemplatePayloadDynamic(templateName, language, params.variables);
    const redactedVariables = this.redactTemplateVariables(params.template, params.variables);
    const sendAt = this.normalizeSendAt(params.sendAt);
    if (!this.enabled) {
      this.logger.warn({ msg: 'WhatsApp disabled; skipping template', template: templatePayload.name, to: toPhone });
      return this.prisma.whatsAppMessageLog.create({
        data: {
          provider: this.providerLabel,
          direction: 'OUTBOUND',
          type: 'TEMPLATE',
          status: 'FAILED',
          toPhone,
          templateName: templatePayload.name,
          templateLanguage: templatePayload.language,
          payload: {
            template: {
              name: templatePayload.name,
              language: templatePayload.language,
              variables: redactedVariables,
            },
            metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) },
          } as Prisma.InputJsonValue,
          supportConversationId: params.supportConversationId ?? null,
          supportMessageId: params.supportMessageId ?? null,
          errorMessage: 'disabled',
        },
      });
    }
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.providerLabel,
        direction: 'OUTBOUND',
        type: 'TEMPLATE',
        status: 'QUEUED',
        toPhone,
        templateName: templatePayload.name,
        templateLanguage: templatePayload.language,
        payload: {
          template: {
            name: templatePayload.name,
            language: templatePayload.language,
            variables: redactedVariables,
          },
          metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) },
        } as Prisma.InputJsonValue,
        supportConversationId: params.supportConversationId ?? null,
        supportMessageId: params.supportMessageId ?? null,
      },
    });

    await this.enqueue({
      type: 'SEND_TEMPLATE',
      logId: log.id,
      to: toPhone,
      template: templatePayload,
      sendAt,
    });

    return log;
  }

  isMessageProProvider() {
    return this.provider === 'message-pro';
  }

  async sendText(params: {
    to: string;
    body: string;
    supportConversationId?: string;
    supportMessageId?: string;
    metadata?: Record<string, unknown>;
    sendAt?: string | Date | null;
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const body = String(params.body ?? '').trim();
    const sendAt = this.normalizeSendAt(params.sendAt);
    if (!this.enabled) {
      this.logger.warn({ msg: 'WhatsApp disabled; skipping text', to: toPhone });
      return this.prisma.whatsAppMessageLog.create({
        data: {
          provider: this.providerLabel,
          direction: 'OUTBOUND',
          type: 'TEXT',
          status: 'FAILED',
          toPhone,
          body,
          payload: { text: body, metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) } } as Prisma.InputJsonValue,
          supportConversationId: params.supportConversationId ?? null,
          supportMessageId: params.supportMessageId ?? null,
          errorMessage: 'disabled',
        },
      });
    }
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.providerLabel,
        direction: 'OUTBOUND',
        type: 'TEXT',
        status: 'QUEUED',
        toPhone,
        body,
        payload: { text: body, metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) } } as Prisma.InputJsonValue,
        supportConversationId: params.supportConversationId ?? null,
        supportMessageId: params.supportMessageId ?? null,
      },
    });

    await this.enqueue({
      type: 'SEND_TEXT',
      logId: log.id,
      to: toPhone,
      text: body,
      sendAt,
    });

    return log;
  }

  async sendDocument(params: {
    to: string;
    link: string;
    filename?: string;
    supportConversationId?: string;
    supportMessageId?: string;
    metadata?: Record<string, unknown>;
    sendAt?: string | Date | null;
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const sendAt = this.normalizeSendAt(params.sendAt);
    if (!this.enabled) {
      this.logger.warn({ msg: 'WhatsApp disabled; skipping document', to: toPhone });
      return this.prisma.whatsAppMessageLog.create({
        data: {
          provider: this.providerLabel,
          direction: 'OUTBOUND',
          type: 'DOCUMENT',
          status: 'FAILED',
          toPhone,
          mediaUrl: params.link,
          payload: {
            document: { link: params.link, filename: params.filename },
            metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) },
          } as Prisma.InputJsonValue,
          supportConversationId: params.supportConversationId ?? null,
          supportMessageId: params.supportMessageId ?? null,
          errorMessage: 'disabled',
        },
      });
    }
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.providerLabel,
        direction: 'OUTBOUND',
        type: 'DOCUMENT',
        status: 'QUEUED',
        toPhone,
        mediaUrl: params.link,
        payload: {
          document: { link: params.link, filename: params.filename },
          metadata: { ...(params.metadata ?? {}), ...(sendAt ? { sendAt } : {}) },
        } as Prisma.InputJsonValue,
        supportConversationId: params.supportConversationId ?? null,
        supportMessageId: params.supportMessageId ?? null,
      },
    });

    await this.enqueue({
      type: 'SEND_DOCUMENT',
      logId: log.id,
      to: toPhone,
      document: { link: params.link, filename: params.filename },
      sendAt,
    });

    return log;
  }

  private resolveProvider(raw?: string): WhatsappProvider {
    if (!raw) return 'mock';
    const normalized = raw.toLowerCase();
    if (normalized === 'meta') return 'meta';
    if (normalized === 'message-pro' || normalized === 'messagepro' || normalized === 'message_pro') {
      return 'message-pro';
    }
    return 'mock';
  }

  private redactTemplateVariables(
    template: WhatsappTemplateKey | string,
    variables: Record<string, string | number | null | undefined>,
  ) {
    const redacted = { ...variables } as Record<string, string | number | null | undefined>;
    if (template === 'otp_verification_v1') {
      if (redacted.otp) redacted.otp = '***';
    }
    if (template === 'password_reset_v1') {
      if (redacted.otp) redacted.otp = '***';
      if (redacted.reset_link) redacted.reset_link = '***';
    }
    return redacted;
  }

  private async enqueue(job: WhatsappQueueJob) {
    if (!this.queue) {
      this.logger.warn({ msg: 'WhatsApp queue missing; dropping job', jobType: job.type, logId: job.logId });
      await this.prisma.whatsAppMessageLog.update({
        where: { id: job.logId },
        data: { status: 'FAILED', errorMessage: 'queue_missing' },
      });
      return;
    }
    const delay = this.resolveDelay(job.sendAt);
    try {
      await this.queue.add(job.type, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 25,
        ...(delay ? { delay } : {}),
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn({ msg: 'Failed to enqueue WhatsApp job', error: message, jobType: job.type, logId: job.logId });
      await this.prisma.whatsAppMessageLog.update({
        where: { id: job.logId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }

  private normalizeSendAt(value?: string | Date | null) {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (date.getTime() <= Date.now()) return undefined;
    return date.toISOString();
  }

  private resolveDelay(sendAt?: string) {
    if (!sendAt) return undefined;
    if (this.provider === 'message-pro') return undefined;
    const date = new Date(sendAt);
    if (Number.isNaN(date.getTime())) return undefined;
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : undefined;
  }
}
