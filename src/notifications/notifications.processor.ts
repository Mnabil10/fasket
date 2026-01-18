import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { NotificationStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeliveryReceipt,
  DirectNotificationJob,
  NotificationChannel,
  NotificationJob,
  NotificationPayload,
  NotificationTarget,
  PushProvider,
  TemplateNotificationJob,
} from './notifications.types';
import axios from 'axios';
import webpush from 'web-push';

type DeviceRecord = {
  id: string;
  userId: string;
  role: UserRole;
  token: string;
  platform: string;
  language: string | null;
  metadata: Prisma.JsonValue | null;
};

type DispatchResult = {
  receipt: DeliveryReceipt;
  channel: NotificationChannel;
  deactivate?: boolean;
};

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly provider: PushProvider = (process.env.PUSH_PROVIDER as PushProvider) ?? 'mock';
  private readonly fcmKey = process.env.FCM_SERVER_KEY;
  private readonly onesignalKey = process.env.ONESIGNAL_REST_KEY;
  private readonly onesignalAppId = process.env.ONESIGNAL_APP_ID;
  private readonly webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  private readonly webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  private readonly webPushSubject = process.env.WEB_PUSH_SUBJECT ?? 'mailto:notifications@fasket.shop';
  private readonly batchSize = Math.max(50, Number(process.env.NOTIFICATION_BATCH_SIZE ?? 500));
  private webPushReady = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') @Optional() private readonly queue?: Queue<NotificationJob>,
  ) {
    super();
    this.configureWebPush();
  }

  async handle(payload: NotificationJob) {
    await this.process({ data: payload } as Job<NotificationJob>);
  }

  async process(job: Job<NotificationJob>) {
    const payload = job.data;
    if (payload.kind === 'template') {
      return this.processTemplate(payload);
    }
    return this.processDirect(payload);
  }

  private async processTemplate(payload: TemplateNotificationJob) {
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: payload.userId, isActive: true },
      select: { id: true, token: true, platform: true, language: true, metadata: true, userId: true, role: true },
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
      const dispatch = await this.dispatchToDevice(device, notification).catch((err: Error) => ({
        receipt: {
          status: 'failed' as const,
          provider: this.provider,
          token: device.token,
          error: err.message,
        },
        channel: 'push' as const,
      }));
      receipts.push(dispatch.receipt);
      await this.logReceipt(payload.notificationId, device, dispatch, notification);
    }
    await this.touchDevices(devices);
    return { receipts };
  }

  private async processDirect(payload: DirectNotificationJob) {
    const target = payload.target;
    const devicesResult = await this.resolveDevices(target, payload.cursor);
    const devices = devicesResult.items;
    if (!devices.length) {
      await this.finalizeNotification(payload.notificationId);
      return;
    }

    await this.markNotificationSending(payload.notificationId);
    const filteredDevices = payload.channel ? devices.filter((device) => this.matchesChannel(device, payload.channel)) : devices;
    const deviceIds = filteredDevices.map((device) => device.id);
    const sentSet = await this.fetchAlreadySent(payload.notificationId, deviceIds);
    const pendingDevices = filteredDevices.filter((device) => !sentSet.has(device.id));
    const receipts: DeliveryReceipt[] = [];
    const failedDevices: DeviceRecord[] = [];
    for (const device of pendingDevices) {
      const dispatch = await this.dispatchToDevice(device, payload.payload, payload.channel).catch((err: Error) => ({
        receipt: {
          status: 'failed' as const,
          provider: this.provider,
          token: device.token,
          error: err.message,
        },
        channel: 'push' as const,
      }));
      receipts.push(dispatch.receipt);
      await this.logReceipt(payload.notificationId, device, dispatch, payload.payload);
      if (dispatch.receipt.status === 'failed') {
        failedDevices.push(device);
      }
      if (dispatch.deactivate) {
        await this.prisma.notificationDevice.updateMany({
          where: { id: device.id },
          data: { isActive: false },
        });
      }
    }

    await this.touchDevices(pendingDevices);
    if (devicesResult.hasMore) {
      await this.enqueueNextBatch(payload, devicesResult.nextCursor);
    }
    if (failedDevices.length) {
      await this.enqueueRetries(payload, failedDevices);
    }
    if (!devicesResult.hasMore && (!failedDevices.length || (payload.retryCount ?? 0) >= 2)) {
      await this.finalizeNotification(payload.notificationId);
    }
    return { receipts };
  }

  private async resolveDevices(target: NotificationTarget, cursor?: string) {
    const baseWhere: Prisma.NotificationDeviceWhereInput = { isActive: true };
    const orderBy = { id: 'asc' as const };
    if (target.type === 'user') {
      baseWhere.userId = target.userId;
    } else if (target.type === 'role') {
      baseWhere.role = target.role;
    } else if (target.type === 'roles') {
      baseWhere.role = { in: target.roles };
    } else if (target.type === 'area') {
      baseWhere.user = { addresses: { some: { zoneId: target.areaId } } };
    } else if (target.type === 'provider') {
      baseWhere.user = { providerMemberships: { some: { providerId: target.providerId } } };
    } else if (target.type === 'devices') {
      baseWhere.id = { in: target.deviceIds };
    }
    const take = target.type === 'devices' ? Math.max(1, target.deviceIds.length) : this.batchSize;
    const devices = await this.prisma.notificationDevice.findMany({
      where: baseWhere,
      take,
      ...(cursor && target.type !== 'devices'
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy,
      select: { id: true, token: true, platform: true, language: true, metadata: true, userId: true, role: true },
    });
    const hasMore = target.type !== 'devices' && devices.length === take;
    const nextCursor = devices.length ? devices[devices.length - 1].id : undefined;
    return { items: devices as DeviceRecord[], hasMore, nextCursor };
  }

  private async fetchAlreadySent(notificationId: string | undefined, deviceIds: string[]) {
    if (!notificationId || !deviceIds.length) return new Set<string>();
    const logs = await this.prisma.notificationLog.findMany({
      where: { notificationId, deviceId: { in: deviceIds }, status: 'sent' },
      select: { deviceId: true },
    });
    return new Set(logs.map((log) => log.deviceId ?? ''));
  }

  private async enqueueNextBatch(payload: DirectNotificationJob, cursor?: string) {
    if (!cursor) return;
    const queueDisabled = (this.queue as any)?.__notificationsDisabled === true;
    if (!this.queue || queueDisabled) {
      setImmediate(() => this.processDirect({ ...payload, cursor }).catch(() => undefined));
      return;
    }
    await this.queue.add('send', { ...payload, cursor }, { removeOnComplete: 50, removeOnFail: 25 });
  }

  private async enqueueRetries(payload: DirectNotificationJob, failedDevices: DeviceRecord[]) {
    const retryCount = (payload.retryCount ?? 0) + 1;
    if (retryCount > 2) return;
    const deviceIds = failedDevices.map((device) => device.id);
    if (!deviceIds.length) return;
    const nextJob: DirectNotificationJob = {
      ...payload,
      target: { type: 'devices', deviceIds },
      retryCount,
    };
    const delay = retryCount * 10_000;
    const queueDisabled = (this.queue as any)?.__notificationsDisabled === true;
    if (!this.queue || queueDisabled) {
      setTimeout(() => this.processDirect(nextJob).catch(() => undefined), delay);
      return;
    }
    await this.queue.add('send', nextJob, {
      delay,
      removeOnComplete: 50,
      removeOnFail: 25,
    });
  }

  private async touchDevices(devices: DeviceRecord[]) {
    if (!devices.length) return;
    await this.prisma.notificationDevice.updateMany({
      where: { id: { in: devices.map((device) => device.id) } },
      data: { lastActiveAt: new Date() },
    });
  }

  private async markNotificationSending(notificationId?: string) {
    if (!notificationId) return;
    await this.prisma.notification.updateMany({
      where: { id: notificationId, status: { in: [NotificationStatus.DRAFT, NotificationStatus.SCHEDULED] } },
      data: { status: NotificationStatus.SENDING },
    });
  }

  private async finalizeNotification(notificationId?: string) {
    if (!notificationId) return;
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: { in: [NotificationStatus.SENDING, NotificationStatus.SCHEDULED, NotificationStatus.DRAFT] },
      },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  }

  private async logReceipt(
    notificationId: string | undefined,
    device: DeviceRecord,
    dispatch: DispatchResult,
    payload: NotificationPayload,
  ) {
    const logData = {
      notificationId: notificationId ?? null,
      userId: device.userId,
      deviceId: device.id,
      channel: dispatch.channel,
      provider: dispatch.receipt.provider,
      status: dispatch.receipt.status === 'success' ? 'sent' : 'failed',
      messageId: dispatch.receipt.messageId ?? null,
      error: dispatch.receipt.error ?? null,
      payload: {
        title: payload.title,
        body: payload.body,
        type: payload.type,
        orderId: payload.orderId,
        priority: payload.priority,
        sound: payload.sound,
        data: payload.data ?? {},
      } as Prisma.InputJsonValue,
    };

    if (notificationId) {
      await this.prisma.notificationLog.upsert({
        where: { notificationId_deviceId: { notificationId, deviceId: device.id } },
        update: logData,
        create: logData,
      });
      return;
    }
    await this.prisma.notificationLog.create({ data: logData });
  }

  private async buildMessage(payload: TemplateNotificationJob, lang: string) {
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

  private async dispatchToDevice(
    device: DeviceRecord,
    payload: NotificationPayload,
    channel?: NotificationChannel,
  ): Promise<DispatchResult> {
    const isWebPush = this.isWebPushDevice(device);
    const targetChannel: NotificationChannel = isWebPush ? 'webpush' : 'push';
    if (channel && channel !== targetChannel) {
      return {
        receipt: { status: 'success', provider: this.provider, token: device.token },
        channel: targetChannel,
      };
    }
    if (isWebPush) {
      return this.sendWebPush(device, payload);
    }
    return this.sendPush(device.token, payload);
  }

  private matchesChannel(device: DeviceRecord, channel: NotificationChannel) {
    const targetChannel = this.isWebPushDevice(device) ? 'webpush' : 'push';
    return targetChannel === channel;
  }

  private isWebPushDevice(device: DeviceRecord) {
    const meta = device.metadata as Record<string, any> | null;
    return device.platform === 'web' && Boolean(meta?.webPush?.p256dh && meta?.webPush?.auth);
  }

  private async sendPush(token: string, payload: NotificationPayload): Promise<DispatchResult> {
    switch (this.provider) {
      case 'fcm':
        if (!this.fcmKey) throw new Error('FCM_SERVER_KEY not configured');
        return { receipt: await this.sendFcm(token, payload), channel: 'push' };
      case 'onesignal':
        if (!this.onesignalKey || !this.onesignalAppId) throw new Error('ONESIGNAL keys not configured');
        return { receipt: await this.sendOneSignal(token, payload), channel: 'push' };
      case 'apns':
        throw new Error('APNS provider not implemented');
      default:
        this.logger.debug({ msg: 'Mock push send', token, payload });
        return { receipt: { status: 'success', provider: 'mock', token, messageId: 'mock' }, channel: 'push' };
    }
  }

  private async sendFcm(token: string, payload: NotificationPayload): Promise<DeliveryReceipt> {
    const data = this.normalizeData(payload);
    const resp = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        to: token,
        priority: payload.priority === 'high' ? 'high' : 'normal',
        notification: {
          title: payload.title,
          body: payload.body,
          sound: payload.sound,
          image: payload.imageUrl,
        },
        data,
      },
      { headers: { Authorization: `key=${this.fcmKey}`, 'Content-Type': 'application/json' } },
    );
    const messageId = resp.data?.message_id ?? resp.data?.name;
    return { status: 'success', provider: 'fcm', token, messageId };
  }

  private async sendOneSignal(token: string, payload: NotificationPayload): Promise<DeliveryReceipt> {
    const data = this.normalizeData(payload);
    const resp = await axios.post(
      'https://api.onesignal.com/notifications',
      {
        app_id: this.onesignalAppId,
        include_player_ids: [token],
        headings: { en: payload.title ?? '' },
        contents: { en: payload.body ?? '' },
        data,
      },
      { headers: { Authorization: `Basic ${this.onesignalKey}`, 'Content-Type': 'application/json' } },
    );
    const messageId = resp.data?.id;
    return { status: 'success', provider: 'onesignal', token, messageId };
  }

  private async sendWebPush(device: DeviceRecord, payload: NotificationPayload): Promise<DispatchResult> {
    if (!this.webPushReady) {
      return {
        receipt: {
          status: 'failed',
          provider: 'webpush',
          token: device.token,
          error: 'Web push is not configured',
        },
        channel: 'webpush',
      };
    }
    const meta = device.metadata as Record<string, any>;
    const subscription = {
      endpoint: device.token,
      keys: {
        p256dh: meta?.webPush?.p256dh,
        auth: meta?.webPush?.auth,
      },
    };
    const data = this.normalizeData(payload);
    try {
      const resp = await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data,
        }),
      );
      const messageId = resp?.headers?.['location'];
      return {
        receipt: { status: 'success', provider: 'webpush', token: device.token, messageId },
        channel: 'webpush',
      };
    } catch (err: any) {
      const statusCode = err?.statusCode;
      const deactivate = statusCode === 404 || statusCode === 410;
      return {
        receipt: {
          status: 'failed',
          provider: 'webpush',
          token: device.token,
          error: err?.message ?? 'webpush_failed',
        },
        channel: 'webpush',
        deactivate,
      };
    }
  }

  private normalizeData(payload: NotificationPayload) {
    const data = {
      ...(payload.data ?? {}),
      title: payload.title,
      body: payload.body,
      type: payload.type,
      orderId: payload.orderId,
      priority: payload.priority ?? 'normal',
      sound: payload.sound,
      imageUrl: payload.imageUrl,
    } as Record<string, any>;
    if (payload.priority === 'high' && data.vibrate === undefined) {
      data.vibrate = 'default';
    }
    return data;
  }

  private configureWebPush() {
    if (!this.webPushPublicKey || !this.webPushPrivateKey) {
      this.webPushReady = false;
      return;
    }
    webpush.setVapidDetails(this.webPushSubject, this.webPushPublicKey, this.webPushPrivateKey);
    this.webPushReady = true;
  }
}
