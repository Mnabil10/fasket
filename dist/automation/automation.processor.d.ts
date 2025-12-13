import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AutomationEventsService } from './automation-events.service';
import { OpsAlertService } from '../ops/ops-alert.service';
type AutomationJob = {
    eventId: string;
};
export declare class AutomationProcessor extends WorkerHost {
    private readonly prisma;
    private readonly config;
    private readonly automation;
    private readonly opsAlerts;
    private readonly queue?;
    private readonly logger;
    private readonly webhookUrl;
    private readonly hmacSecret;
    constructor(prisma: PrismaService, config: ConfigService, automation: AutomationEventsService, opsAlerts: OpsAlertService, queue?: Queue | undefined);
    process(job: Job<AutomationJob>): Promise<void>;
    handleEventById(eventId: string): Promise<void>;
    private snippet;
    private applyRetryAfter;
    private sign;
    private nextDelayMs;
    private emitOpsMisconfigured;
    private emitOpsDeliveryFailed;
}
export {};
