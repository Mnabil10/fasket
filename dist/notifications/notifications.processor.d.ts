import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationJob } from './notifications.types';
export declare class NotificationsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    process(job: Job<NotificationJob>): Promise<void>;
    private buildMessage;
    private render;
}
