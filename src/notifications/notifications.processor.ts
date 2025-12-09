import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryReceipt, NotificationJob, PushProvider } from './notifications.types';
import axios from 'axios';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly provider: PushProvider = (process.env.PUSH_PROVIDER as PushProvider) ?? 'mock';
  private readonly fcmKey = process.env.FCM_SERVER_KEY;
  private readonly onesignalKey = process.env.ONESIGNAL_REST_KEY;
  private readonly onesignalAppId = process.env.ONESIGNAL_APP_ID;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJob>) {
    const payload = job.data;
    const redisStatus = (await this.redisPing().catch(() => 'down')) as 'up' | 'down';
    if (redisStatus === 'down') {
      this.logger.warn({ msg: 'Redis unavailable during notification processing' });
    }
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: payload.userId },
      select: { token: true, platform: true, language: true },
    });
    if (!devices.length) {
      this.logger.debug({
        msg: 'No registered devices for notification',
        userId: payload.userId,
        key: payload.key,
      });
      return;
    }
    const receipts: DeliveryReceipt[] = [];
    for (const device of devices) {
      const notification = await this.buildMessage(payload, device.language ?? 'en');
      const receipt = await this.dispatch(device.token, notification.title, notification.body, payload.data).catch(
        (err: Error) => ({
          status: 'failed' as const,
          provider: this.provider,
          token: device.token,
          error: err.message,
        }),
      );
      receipts.push(receipt);
      this.logger.log({
        msg: 'Dispatching push notification',
        userId: payload.userId,
        platform: device.platform,
        language: device.language,
        key: payload.key,
        title: notification.title,
        receiptStatus: receipt.status,
      });
    }
    await this.prisma.pushDevice.updateMany({
      where: { userId: payload.userId, token: { in: devices.map((device) => device.token) } },
      data: { lastActiveAt: new Date() },
    });
    await this.prisma.notificationTemplate.findFirst(); // no-op to keep Prisma active
    return { receipts };
  }

  private async buildMessage(payload: NotificationJob, lang: string) {
    const template =
      (await this.prisma.notificationTemplate.findFirst({
        where: { key: payload.key, language: lang, isActive: true },
      })) ||
      (await this.prisma.notificationTemplate.findFirst({
        where: { key: payload.key, language: 'en', isActive: true },
      }));

    const fallbackTitle = this.render('{{key}}', { key: payload.key });
    const fallbackBody = this.render('Notification: {{key}}', { key: payload.key });
    if (!template) {
      return { title: fallbackTitle, body: fallbackBody, data: payload.data };
    }
    return {
      title: this.render(template.title ?? fallbackTitle, payload.data),
      body: this.render(template.body ?? fallbackBody, payload.data),
      data: payload.data,
    };
  }

  private render(tpl: string, ctx: Record<string, any>) {
    return tpl.replace(/{{\s*(\w+)\s*}}/g, (_m, key: string) => {
      const value = ctx[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  private async redisPing(): Promise<'up' | 'down'> {
    try {
      const RedisLib = require('ioredis');
      const client = new RedisLib(process.env.REDIS_URL, { lazyConnect: true });
      await client.connect();
      await client.ping();
      await client.disconnect();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async dispatch(token: string, title?: string, body?: string, data?: Record<string, any>): Promise<DeliveryReceipt> {
    switch (this.provider) {
      case 'fcm':
        if (!this.fcmKey) throw new Error('FCM_SERVER_KEY not configured');
        return this.sendFcm(token, title, body, data);
      case 'onesignal':
        if (!this.onesignalKey || !this.onesignalAppId) throw new Error('ONESIGNAL keys not configured');
        return this.sendOneSignal(token, title, body, data);
      case 'apns':
        throw new Error('APNS provider not implemented');
      default:
        this.logger.debug({ msg: 'Mock push send', token, title, body, data });
        return { status: 'success', provider: 'mock', token, messageId: 'mock' };
    }
  }

  private async sendFcm(token: string, title?: string, body?: string, data?: Record<string, any>): Promise<DeliveryReceipt> {
    const resp = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        to: token,
        notification: { title, body },
        data: data ?? {},
      },
      { headers: { Authorization: `key=${this.fcmKey}`, 'Content-Type': 'application/json' } },
    );
    const messageId = resp.data?.message_id ?? resp.data?.name;
    return { status: 'success', provider: 'fcm', token, messageId };
  }

  private async sendOneSignal(
    token: string,
    title?: string,
    body?: string,
    data?: Record<string, any>,
  ): Promise<DeliveryReceipt> {
    const resp = await axios.post(
      'https://api.onesignal.com/notifications',
      {
        app_id: this.onesignalAppId,
        include_player_ids: [token],
        headings: { en: title ?? '' },
        contents: { en: body ?? '' },
        data: data ?? {},
      },
      { headers: { Authorization: `Basic ${this.onesignalKey}`, 'Content-Type': 'application/json' } },
    );
    const messageId = resp.data?.id;
    return { status: 'success', provider: 'onesignal', token, messageId };
  }
}
