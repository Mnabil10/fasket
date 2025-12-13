import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
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
export declare class AutomationEventsService {
    private readonly prisma;
    private readonly context;
    private readonly queue?;
    private readonly processor?;
    private readonly logger;
    constructor(prisma: PrismaService, context: RequestContextService, queue?: Queue | undefined, processor?: AutomationProcessor | undefined);
    emit(type: string, payload: Record<string, any>, options?: AutomationEmitOptions): Promise<AutomationEventRef>;
    enqueue(eventId: string, nextAttemptAt?: Date): Promise<void>;
    enqueueMany(events: AutomationEventRef[]): Promise<void>;
    private defaultDedupeKey;
    private hashFragment;
}
