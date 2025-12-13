import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import { createHmac } from 'crypto';
import { AutomationEventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AutomationEventsService } from './automation-events.service';
import { OpsAlertService } from '../ops/ops-alert.service';
import * as Sentry from '@sentry/node';

type AutomationJob = { eventId: string };

const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000];
const MISCONFIG_DELAY_MS = 15 * 60 * 1000;
let lastMisconfigAlertAt = 0;

@Processor('automation-events')
@Injectable()
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);
  private readonly webhookUrl: string;
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly automation: AutomationEventsService,
    private readonly opsAlerts: OpsAlertService,
    @InjectQueue('automation-events') @Optional() private readonly queue?: Queue,
  ) {
    super();
    this.webhookUrl = this.config.get<string>('AUTOMATION_WEBHOOK_URL') ?? '';
    this.hmacSecret = this.config.get<string>('AUTOMATION_HMAC_SECRET') ?? '';
  }

  async process(job: Job<AutomationJob>): Promise<void> {
    await this.handleEventById(job.data.eventId);
  }

  async handleEventById(eventId: string) {
    const event = await this.prisma.automationEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      this.logger.warn({ msg: 'Automation event missing', eventId });
      return;
    }
    if (!this.webhookUrl || !this.hmacSecret) {
      const missing = {
        webhook: !this.webhookUrl,
        hmac: !this.hmacSecret,
        nodeEnv: this.config.get<string>('NODE_ENV'),
      };
      this.logger.error({
        msg: 'Automation misconfigured - deferring',
        eventId,
        missingWebhook: missing.webhook,
        missingHmac: missing.hmac,
        env: missing.nodeEnv,
      });
      const nextAttemptAt = new Date(Date.now() + MISCONFIG_DELAY_MS);
      await this.prisma.automationEvent.update({
        where: { id: eventId },
        data: {
          status: AutomationEventStatus.FAILED,
          nextAttemptAt,
          lastError: 'AUTOMATION_MISCONFIGURED',
          lastResponseAt: new Date(),
        },
      });
      if (Date.now() - lastMisconfigAlertAt > 60 * 60 * 1000) {
        lastMisconfigAlertAt = Date.now();
        await this.emitOpsMisconfigured(eventId, missing);
      }
      Sentry.captureMessage('Automation misconfigured', {
        level: 'error',
        extra: { eventId, missingWebhook: missing.webhook, missingHmac: missing.hmac, env: missing.nodeEnv },
      });
      if (this.queue) {
        await this.queue.add('deliver', { eventId }, { delay: MISCONFIG_DELAY_MS, removeOnComplete: 50, removeOnFail: 25 });
      } else {
        setTimeout(() => this.handleEventById(eventId).catch((err) => this.logger.error(err)), MISCONFIG_DELAY_MS);
      }
      return;
    }
    if (event.status === AutomationEventStatus.SENT || event.status === AutomationEventStatus.DEAD) {
      return;
    }

    if (event.nextAttemptAt && event.nextAttemptAt.getTime() > Date.now()) {
      // defer until next attempt time
      const delay = event.nextAttemptAt.getTime() - Date.now();
      if (this.queue) {
        await this.queue.add('deliver', { eventId }, { delay, removeOnComplete: 50, removeOnFail: 25 });
      } else {
        setTimeout(() => this.handleEventById(eventId).catch((err) => this.logger.error(err)), delay);
      }
      return;
    }

    const attemptNumber = (event.attempts ?? 0) + 1;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      event_id: event.id,
      event_type: event.type,
      occurred_at: event.createdAt.toISOString(),
      correlation_id: event.correlationId,
      version: '1.0',
      dedupe_key: event.dedupeKey,
      attempt: attemptNumber,
      data: event.payload,
    };
    const body = JSON.stringify(payload);
    const signature = this.sign(`${timestamp}.${body}`);

    try {
      const response = await axios.post(this.webhookUrl, body, {
        headers: {
          'content-type': 'application/json',
          'x-fasket-event': event.type,
          'x-fasket-id': event.id,
          'x-fasket-timestamp': String(timestamp),
          'x-fasket-signature': signature,
          'x-fasket-attempt': String(attemptNumber),
          'x-fasket-spec-version': '1.0',
        },
        timeout: 5000,
        validateStatus: () => true,
      });
      if (response.status === 409) {
        this.logger.warn({ msg: 'Received 409, treating as delivered (idempotent)', eventId: event.id });
      }
      if (response.status >= 200 && response.status < 300 || response.status === 409) {
        await this.prisma.automationEvent.update({
          where: { id: event.id },
          data: {
            status: AutomationEventStatus.SENT,
            attempts: attemptNumber,
            nextAttemptAt: null,
            lastHttpStatus: response.status,
            lastError: null,
            lastResponseAt: new Date(),
            lastResponseBodySnippet: this.snippet(response.data),
            sentAt: new Date(),
          },
        });
        this.logger.log({ msg: 'Automation event delivered', eventId: event.id, status: response.status });
        return;
      }
      throw new Error(`Webhook responded with status ${response.status}`);
    } catch (err) {
      const delay = this.nextDelayMs(attemptNumber);
      const status: AutomationEventStatus =
        delay === null ? AutomationEventStatus.DEAD : AutomationEventStatus.FAILED;
      await this.prisma.automationEvent.update({
        where: { id: event.id },
        data: {
          status,
          attempts: attemptNumber,
          nextAttemptAt: delay === null ? null : new Date(Date.now() + delay),
          lastError: (err as Error).message,
          lastResponseAt: new Date(),
          lastResponseBodySnippet: this.snippet((err as any)?.response?.data),
          lastHttpStatus: (err as any)?.response?.status ?? null,
        },
      });
      this.logger.warn({
        msg: 'Automation delivery failed',
        eventId: event.id,
        attempt: attemptNumber,
        status,
        delayMs: delay ?? undefined,
        error: (err as Error).message,
      });
      if (status === AutomationEventStatus.DEAD || attemptNumber > BACKOFF_MS.length) {
        await this.emitOpsDeliveryFailed(event, attemptNumber, (err as any)?.response?.status);
        Sentry.captureMessage('Automation delivery failed', {
          level: 'error',
          extra: { eventId: event.id, type: event.type, attempts: attemptNumber, httpStatus: (err as any)?.response?.status },
        });
      }
      if (status === AutomationEventStatus.FAILED) {
        const effectiveDelay = this.applyRetryAfter(delay!, err);
        if (this.queue) {
          await this.queue.add('deliver', { eventId }, { delay: effectiveDelay, removeOnComplete: 50, removeOnFail: 25 });
        } else {
          setTimeout(() => this.handleEventById(eventId).catch((error) => this.logger.error(error)), effectiveDelay);
        }
      }
    }
  }

  private snippet(body: any) {
    try {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      return str.slice(0, 1024);
    } catch {
      return undefined;
    }
  }

  private applyRetryAfter(delay: number, err: any) {
    const retryAfterHeader = (err as any)?.response?.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    if (retryAfterMs && Number.isFinite(retryAfterMs)) {
      return Math.max(delay, retryAfterMs);
    }
    return delay;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }

  private nextDelayMs(attempt: number): number | null {
    if (attempt <= BACKOFF_MS.length) {
      const base = BACKOFF_MS[attempt - 1];
      const jitter = 0.2 * base;
      const delta = Math.floor(Math.random() * jitter * 2 - jitter);
      return Math.max(1_000, base + delta);
    }
    return null;
  }

  private async emitOpsMisconfigured(eventId: string, missing: { webhook: boolean; hmac: boolean; nodeEnv?: string | null }) {
    await this.opsAlerts.notify(
      'ops.automation_misconfigured',
      {
        event_id: eventId,
        missing_webhook: missing.webhook,
        missing_hmac: missing.hmac,
        node_env: missing.nodeEnv,
        occurred_at: new Date().toISOString(),
      },
      `ops:automation:misconfigured:${Math.floor(Date.now() / (60 * 60 * 1000))}`,
    );
  }

  private async emitOpsDeliveryFailed(event: any, attempt: number, status?: number) {
    await this.opsAlerts.notify(
      'ops.automation_delivery_failed',
      {
        event_id: event.id,
        event_type: event.type,
        attempts: attempt,
        last_status: status ?? null,
        correlation_id: event.correlationId,
      },
      `ops:automation:delivery_failed:${event.id}:${attempt}`,
    );
  }
}
