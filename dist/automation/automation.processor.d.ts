import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
type AutomationJob = {
    eventId: string;
};
export declare class AutomationProcessor extends WorkerHost {
    private readonly prisma;
    private readonly config;
    private readonly queue?;
    private readonly logger;
    private readonly webhookUrl;
    private readonly hmacSecret;
    constructor(prisma: PrismaService, config: ConfigService, queue?: Queue | undefined);
    process(job: Job<AutomationJob>): Promise<void>;
    handleEventById(eventId: string): Promise<void>;
    private snippet;
    private applyRetryAfter;
    private sign;
    private nextDelayMs;
}
export {};
