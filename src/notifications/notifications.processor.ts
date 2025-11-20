import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationJob } from './notifications.types';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJob>) {
    const payload = job.data;
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
    for (const device of devices) {
      const notification = await this.buildMessage(payload, device.language ?? 'en');
      this.logger.log({
        msg: 'Dispatching push notification',
        userId: payload.userId,
        platform: device.platform,
        language: device.language,
        key: payload.key,
        title: notification.title,
      });
      // TODO: integrate with FCM/APNS provider using device.token
    }
    await this.prisma.pushDevice.updateMany({
      where: { userId: payload.userId, token: { in: devices.map((device) => device.token) } },
      data: { lastActiveAt: new Date() },
    });
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
}
