import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DeliveryDriver } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto';
import { NotificationJob, TemplateKey } from './notifications.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') @Optional() private readonly queue?: Queue<NotificationJob>,
  ) {}

  async notify(key: TemplateKey, userId: string, data: Record<string, any>) {
    await this.enqueue({ key, userId, data });
  }

  async notifyDriverAssigned(
    userId: string,
    orderId: string,
    driver: Pick<DeliveryDriver, 'id' | 'fullName' | 'phone'>,
  ) {
    await this.notify('order_assigned_driver', userId, {
      orderId,
      driverId: driver.id,
      driverName: driver.fullName,
      driverPhone: driver.phone,
    });
  }

  async notifyLoyaltyEarned(userId: string, points: number, orderId: string) {
    await this.notify('loyalty_earned', userId, { points, orderId });
  }

  async notifyLoyaltyRedeemed(userId: string, points: number, discountCents: number, orderId: string) {
    await this.notify('loyalty_redeemed', userId, { points, discountCents, orderId });
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const normalizedLanguage = dto.language?.toLowerCase() ?? 'en';
    const now = new Date();
    const device = await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform ?? 'unknown',
        language: normalizedLanguage,
        appVersion: dto.appVersion,
        deviceModel: dto.deviceModel,
        lastActiveAt: now,
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform ?? 'unknown',
        language: normalizedLanguage,
        appVersion: dto.appVersion,
        deviceModel: dto.deviceModel,
        lastActiveAt: now,
      },
    });
    this.logger.log({
      msg: 'Registered push device',
      userId,
      platform: device.platform,
    });
    return { success: true, deviceId: device.id };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({
      where: { userId, token },
    });
    this.logger.log({ msg: 'Unregistered push device', userId });
    return { success: true };
  }

  private async enqueue(payload: NotificationJob) {
    if (!this.queue) {
      // Redis-off fallback: process synchronously via processor logic
      const processor = new (require('./notifications.processor').NotificationsProcessor)(this.prisma);
      await processor.process({ data: payload } as any);
      return;
    }
    try {
      await this.queue.add('send', payload, {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn({ msg: 'Notification queue unavailable, dropping job', error: msg, payload });
    }
  }
}
