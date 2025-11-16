import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    enqueueOrderStatusPush(orderId: string, status: string): Promise<void>;
    registerDevice(userId: string, token: string, platform: string): Promise<{
        success: boolean;
        deviceId: string;
    }>;
}
