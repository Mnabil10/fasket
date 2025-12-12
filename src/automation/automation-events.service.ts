import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma, AutomationEventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/context/request-context.service';
import { AutomationProcessor } from './automation.processor';

export interface AutomationEmitOptions {
  tx?: Prisma.TransactionClient;
  dedupeKey?: string;
  nextAttemptAt?: Date;
  correlationId?: string;
}

export interface AutomationEventRef {
  id: string;
  nextAttemptAt?: Date | null;
}

@Injectable()
export class AutomationEventsService {
  private readonly logger = new Logger(AutomationEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    @InjectQueue('automation-events') @Optional() private readonly queue?: Queue,
    @Optional() private readonly processor?: AutomationProcessor,
  ) {}

  async emit(type: string, payload: Record<string, any>, options: AutomationEmitOptions = {}): Promise<AutomationEventRef> {
    const correlationId = options.correlationId ?? this.context.get('correlationId');
    const nextAttemptAt = options.nextAttemptAt ?? new Date();
    const client: Prisma.TransactionClient | PrismaService = options.tx ?? this.prisma;
    const dedupeKey = options.dedupeKey ?? this.defaultDedupeKey(type, payload);
    if (options.dedupeKey) {
      const existing = await client.automationEvent.findFirst({
        where: { dedupeKey: options.dedupeKey, type },
        select: { id: true, nextAttemptAt: true, status: true },
      });
      if (existing) {
        if (!options.tx) {
          await this.enqueue(existing.id, existing.nextAttemptAt ?? undefined);
        }
        if (existing.status === AutomationEventStatus.SENT || existing.status === AutomationEventStatus.DEAD) {
          return { id: existing.id, nextAttemptAt: existing.nextAttemptAt };
        }
        return { id: existing.id, nextAttemptAt: existing.nextAttemptAt };
      }
    }
    const event = await client.automationEvent.create({
      data: {
        type,
        payload: payload as any,
        status: AutomationEventStatus.PENDING,
        attempts: 0,
        nextAttemptAt,
        dedupeKey,
        correlationId,
      },
      select: { id: true, nextAttemptAt: true },
    });

    // Only enqueue immediately when we are not inside an explicit transaction
    if (!options.tx) {
      await this.enqueue(event.id, event.nextAttemptAt ?? undefined);
    }
    return { id: event.id, nextAttemptAt: event.nextAttemptAt };
  }

  async enqueue(eventId: string, nextAttemptAt?: Date) {
    const event = await this.prisma.automationEvent.findUnique({
      where: { id: eventId },
      select: { status: true, nextAttemptAt: true },
    });
    if (!event) {
      this.logger.warn({ msg: 'Cannot enqueue missing automation event', eventId });
      return;
    }
    if (event.status === AutomationEventStatus.SENT || event.status === AutomationEventStatus.DEAD) {
      this.logger.debug({ msg: 'Skipping enqueue for finalized automation event', eventId, status: event.status });
      return;
    }
    const targetNext = nextAttemptAt ?? event.nextAttemptAt ?? new Date();
    const delay = targetNext ? Math.max(0, targetNext.getTime() - Date.now()) : 0;
    const queueDisabled = (this.queue as any)?.__automationDisabled === true;
    if (this.queue && !queueDisabled) {
      await this.queue.add(
        'deliver',
        { eventId },
        {
          delay,
          removeOnComplete: 50,
          removeOnFail: 25,
        },
      );
      return;
    }
    if (queueDisabled) {
      this.logger.warn({ msg: 'Automation queue disabled; event left pending', eventId, status: event.status });
      return;
    }
    if (this.processor) {
      setImmediate(async () => {
        try {
          await this.processor?.handleEventById(eventId);
        } catch (err) {
          const msg = (err as Error)?.message;
          this.logger.warn({ msg: 'Inline automation processing failed', eventId, error: msg });
        }
      });
      return;
    }
    this.logger.warn({ msg: 'No automation queue or processor available; event not dispatched', eventId });
  }

  async enqueueMany(events: AutomationEventRef[]) {
    await Promise.all(events.map((event) => this.enqueue(event.id, event.nextAttemptAt ?? undefined)));
  }

  private defaultDedupeKey(type: string, payload: Record<string, any>) {
    const hint = payload?.order_id || payload?.orderId || payload?.otpId || payload?.event_id;
    return hint ? `${type}:${hint}` : `${type}:${Date.now()}`;
  }
}
