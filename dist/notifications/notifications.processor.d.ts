import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryReceipt, NotificationJob } from './notifications.types';
export declare class NotificationsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly logger;
    private readonly provider;
    private readonly fcmKey;
    private readonly onesignalKey;
    private readonly onesignalAppId;
    constructor(prisma: PrismaService);
    process(job: Job<NotificationJob>): Promise<{
        receipts: DeliveryReceipt[];
    } | undefined>;
    private buildMessage;
    private render;
    private redisPing;
    private dispatch;
    private sendFcm;
    private sendOneSignal;
}
