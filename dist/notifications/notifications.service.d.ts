import { DeliveryDriver } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto';
import { NotificationJob, TemplateKey } from './notifications.types';
export declare class NotificationsService {
    private readonly prisma;
    private readonly queue;
    private readonly logger;
    constructor(prisma: PrismaService, queue: Queue<NotificationJob>);
    notify(key: TemplateKey, userId: string, data: Record<string, any>): Promise<void>;
    notifyDriverAssigned(userId: string, orderId: string, driver: Pick<DeliveryDriver, 'id' | 'fullName' | 'phone'>): Promise<void>;
    notifyLoyaltyEarned(userId: string, points: number, orderId: string): Promise<void>;
    notifyLoyaltyRedeemed(userId: string, points: number, discountCents: number, orderId: string): Promise<void>;
    registerDevice(userId: string, dto: RegisterDeviceDto): Promise<{
        success: boolean;
        deviceId: string;
    }>;
    unregisterDevice(userId: string, token: string): Promise<{
        success: boolean;
    }>;
    private enqueue;
}
