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
  private readonly defaultLanguage: WhatsappTemplateLanguage;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('whatsapp.send') @Optional() private readonly queue?: Queue<WhatsappQueueJob>,
  ) {
    this.provider = this.resolveProvider(this.config.get<string>('WHATSAPP_PROVIDER'));
    this.defaultLanguage = normalizeWhatsappLanguage(this.config.get<string>('WHATSAPP_DEFAULT_LANGUAGE'));
  }

  async sendTemplate(params: {
    to: string;
    template: WhatsappTemplateKey | string;
    language?: WhatsappTemplateLanguage;
    variables: Record<string, string | number | null | undefined>;
    supportConversationId?: string;
    supportMessageId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const language = normalizeWhatsappLanguage(params.language ?? this.defaultLanguage);
    const templateName = String(params.template).trim();
    const templatePayload = buildWhatsappTemplatePayloadDynamic(templateName, language, params.variables);
    const redactedVariables = this.redactTemplateVariables(params.template, params.variables);
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.provider === 'meta' ? 'META' : 'MOCK',
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
          metadata: params.metadata ?? null,
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
    });

    return log;
  }

  async sendText(params: {
    to: string;
    body: string;
    supportConversationId?: string;
    supportMessageId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const body = String(params.body ?? '').trim();
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.provider === 'meta' ? 'META' : 'MOCK',
        direction: 'OUTBOUND',
        type: 'TEXT',
        status: 'QUEUED',
        toPhone,
        body,
        payload: { text: body, metadata: params.metadata ?? null } as Prisma.InputJsonValue,
        supportConversationId: params.supportConversationId ?? null,
        supportMessageId: params.supportMessageId ?? null,
      },
    });

    await this.enqueue({
      type: 'SEND_TEXT',
      logId: log.id,
      to: toPhone,
      text: body,
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
  }) {
    const toPhone = normalizePhoneToE164(params.to);
    const log = await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.provider === 'meta' ? 'META' : 'MOCK',
        direction: 'OUTBOUND',
        type: 'DOCUMENT',
        status: 'QUEUED',
        toPhone,
        mediaUrl: params.link,
        payload: { document: { link: params.link, filename: params.filename }, metadata: params.metadata ?? null } as Prisma.InputJsonValue,
        supportConversationId: params.supportConversationId ?? null,
        supportMessageId: params.supportMessageId ?? null,
      },
    });

    await this.enqueue({
      type: 'SEND_DOCUMENT',
      logId: log.id,
      to: toPhone,
      document: { link: params.link, filename: params.filename },
    });

    return log;
  }

  private resolveProvider(raw?: string): WhatsappProvider {
    if (!raw) return 'mock';
    const normalized = raw.toLowerCase();
    return normalized === 'meta' ? 'meta' : 'mock';
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
    try {
      await this.queue.add(job.type, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 25,
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
}
