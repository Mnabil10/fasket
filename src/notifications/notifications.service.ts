// path: src/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueueOrderStatusPush(orderId: string, status: string) {
    // Why: keep a lightweight stub; integrate FCM/OneSignal later
    this.logger.log({ msg: 'Queued order status push', orderId, status });
  }

  async registerDevice(userId: string, token: string, platform: string) {
    const device = await this.prisma.pushDevice.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    this.logger.log({ msg: 'Registered device token', userId, platform });
    return { success: true, deviceId: device.id };
  }
}
