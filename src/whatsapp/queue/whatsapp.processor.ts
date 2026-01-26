import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaCloudClient } from '../clients/meta-cloud.client';
import { MockWhatsappClient } from '../clients/mock.client';
import { MessageProClient } from '../clients/message-pro.client';
import { WhatsappQueueJob, WhatsappSendResult } from '../whatsapp.types';

@Processor('whatsapp.send')
@Injectable()
export class WhatsappProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappProcessor.name);
  private readonly provider: 'meta' | 'mock' | 'message-pro';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: MetaCloudClient,
    private readonly mock: MockWhatsappClient,
    private readonly messagePro: MessageProClient,
  ) {
    super();
    const raw = (this.config.get<string>('WHATSAPP_PROVIDER') || 'mock').toLowerCase();
    this.provider =
      raw === 'meta' ? 'meta' : raw === 'message-pro' || raw === 'messagepro' || raw === 'message_pro' ? 'message-pro' : 'mock';
  }

  async process(job: Job<WhatsappQueueJob>) {
    const payload = job.data;
    const log = await this.prisma.whatsAppMessageLog.findUnique({ where: { id: payload.logId } });
    if (!log) {
      this.logger.warn({ msg: 'WhatsApp log missing; skipping send', logId: payload.logId, jobId: job.id });
      return;
    }

    try {
      const result = await this.dispatch(payload);
      if (result.status === 'failed') {
        await this.updateFailure(log.id, result.error || 'send_failed', job);
        throw new Error(result.error || 'send_failed');
      }
      await this.prisma.whatsAppMessageLog.update({
        where: { id: log.id },
        data: {
          status: this.provider === 'mock' ? 'DELIVERED' : 'SENT',
          providerMessageId: result.messageId || log.providerMessageId,
          attempts: job.attemptsMade + 1,
          errorMessage: null,
          errorCode: null,
        },
      });
      this.logger.log({ msg: 'WhatsApp send success', logId: log.id, provider: this.provider, messageId: result.messageId });
    } catch (err) {
      const message = (err as Error)?.message || 'send_failed';
      this.logger.warn({ msg: 'WhatsApp send failed', logId: log.id, error: message, attempt: job.attemptsMade + 1 });
      throw err;
    }
  }

  private async dispatch(payload: WhatsappQueueJob): Promise<WhatsappSendResult> {
    const client =
      this.provider === 'meta' ? this.meta : this.provider === 'message-pro' ? this.messagePro : this.mock;
    if (payload.type === 'SEND_TEMPLATE') {
      if (!payload.template) {
        return { messageId: '', status: 'failed', error: 'template_missing' };
      }
      return client.sendTemplate(payload.to, payload.template, payload.sendAt);
    }
    if (payload.type === 'SEND_TEXT') {
      if (!payload.text) {
        return { messageId: '', status: 'failed', error: 'text_missing' };
      }
      return client.sendText(payload.to, payload.text, payload.sendAt);
    }
    if (payload.type === 'SEND_DOCUMENT') {
      if (!payload.document?.link) {
        return { messageId: '', status: 'failed', error: 'document_missing' };
      }
      return client.sendDocument(payload.to, payload.document, payload.sendAt);
    }
    return { messageId: '', status: 'failed', error: 'unknown_job_type' };
  }

  private async updateFailure(logId: string, error: string, job: Job<WhatsappQueueJob>) {
    await this.prisma.whatsAppMessageLog.update({
      where: { id: logId },
      data: {
        status: 'FAILED',
        attempts: job.attemptsMade + 1,
        errorMessage: error,
      },
    });
  }
}
