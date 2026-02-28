import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { NotificationStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
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
import * as admin from 'firebase-admin';
import * as fs from 'fs';
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
  private readonly fcmServiceAccountJson =
    process.env.FCM_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  private readonly fcmServiceAccountPath =
    process.env.FCM_SERVICE_ACCOUNT_PATH ??
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  private readonly fcmUseApplicationDefault = process.env.FCM_USE_APPLICATION_DEFAULT === 'true';
  private readonly onesignalKey = process.env.ONESIGNAL_REST_KEY;
  private readonly onesignalAppId = process.env.ONESIGNAL_APP_ID;
  private readonly webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  private readonly webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  private readonly webPushSubject = process.env.WEB_PUSH_SUBJECT ?? 'mailto:notifications@fasket.shop';
  private readonly batchSize = Math.max(50, Number(process.env.NOTIFICATION_BATCH_SIZE ?? 500));
  private webPushReady = false;
  private firebaseApp?: admin.app.App;
  private firebaseInitError?: Error;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') @Optional() private readonly queue?: Queue<NotificationJob>,
    @Optional() private readonly analytics?: AnalyticsService,
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
      const dispatch = await this.dispatchToDevice(device, notification).catch((err: Error): DispatchResult => ({
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
      if (dispatch.deactivate) {
        await this.prisma.notificationDevice.updateMany({
          where: { id: device.id },
          data: { isActive: false, isEnabled: false, lastSeenAt: new Date() },
        });
      }
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
    const targetChannel = payload.channel;
    const filteredDevices = targetChannel ? devices.filter((device) => this.matchesChannel(device, targetChannel)) : devices;
    const deviceIds = filteredDevices.map((device) => device.id);
    const sentSet = await this.fetchAlreadySent(payload.notificationId, deviceIds);
    const pendingDevices = filteredDevices.filter((device) => !sentSet.has(device.id));
    const receipts: DeliveryReceipt[] = [];
    const failedDevices: DeviceRecord[] = [];
    for (const device of pendingDevices) {
      const dispatch = await this.dispatchToDevice(device, payload.payload, payload.channel).catch((err: Error): DispatchResult => ({
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
      if (dispatch.receipt.status === 'failed' && !dispatch.deactivate) {
        failedDevices.push(device);
      }
      if (dispatch.deactivate) {
        await this.prisma.notificationDevice.updateMany({
          where: { id: device.id },
          data: { isActive: false, isEnabled: false, lastSeenAt: new Date() },
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
    const baseWhere: Prisma.NotificationDeviceWhereInput = { isActive: true, isEnabled: true };
    const orderBy = { id: 'asc' as const };
    if (target.type === 'user') {
      baseWhere.userId = target.userId;
    } else if (target.type === 'role') {
      baseWhere.role = target.role;
    } else if (target.type === 'roles') {
      baseWhere.role = { in: target.roles };
    } else if (target.type === 'area') {
      baseWhere.user = { addresses: { some: { zoneId: target.areaId } } };
    } else if (target.type === 'areas') {
      baseWhere.user = { addresses: { some: { zoneId: { in: target.areaIds } } } };
    } else if (target.type === 'provider') {
      baseWhere.user = { providerMemberships: { some: { providerId: target.providerId } } };
    } else if (target.type === 'customers_with_coupons') {
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.user = {
        orders: {
          some: {
            OR: [
              { couponId: { not: null } },
              { couponCode: { not: null } },
            ],
          },
        },
      };
    } else if (target.type === 'coupon_users') {
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.user = {
        orders: {
          some: {
            OR: [
              { couponId: target.couponId },
              ...(target.couponCode ? [{ couponCode: target.couponCode }] : []),
            ],
          },
        },
      };
    } else if (target.type === 'provider_customers') {
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.user = { orders: { some: { providerId: target.providerId } } };
    } else if (target.type === 'recent_customers') {
      const since = new Date(Date.now() - Math.max(1, target.days) * 24 * 60 * 60 * 1000);
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.user = { orders: { some: { createdAt: { gte: since } } } };
    } else if (target.type === 'minimum_orders') {
      const userIds = await this.resolveUsersByMinimumOrders(target.minOrders);
      if (!userIds.length) {
        return { items: [] as DeviceRecord[], hasMore: false, nextCursor: undefined };
      }
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.userId = { in: userIds };
    } else if (target.type === 'minimum_orders_recent') {
      const userIds = await this.resolveUsersByMinimumOrders(target.minOrders, target.days);
      if (!userIds.length) {
        return { items: [] as DeviceRecord[], hasMore: false, nextCursor: undefined };
      }
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.userId = { in: userIds };
    } else if (target.type === 'delivery_campaign_customers') {
      baseWhere.role = UserRole.CUSTOMER;
      baseWhere.user = { orders: { some: { deliveryCampaignId: target.deliveryCampaignId } } };
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

  private async resolveUsersByMinimumOrders(minOrders: number, days?: number) {
    const minOrdersSafe = Math.max(1, minOrders);
    const since =
      days && days > 0
        ? new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000)
        : null;
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT "userId"
      FROM "Order"
      WHERE "userId" IS NOT NULL
      ${since ? Prisma.sql`AND "createdAt" >= ${since}` : Prisma.empty}
      GROUP BY "userId"
      HAVING COUNT(*) >= ${minOrdersSafe}
    `);
    return rows.map((row) => row.userId).filter(Boolean);
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
    const delay = Math.min(300_000, Math.pow(2, retryCount - 1) * 10_000);
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
      data: { lastActiveAt: new Date(), lastSeenAt: new Date() },
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
      await this.emitNotificationAnalytics(dispatch, device, payload);
      return;
    }
    await this.prisma.notificationLog.create({ data: logData });
    await this.emitNotificationAnalytics(dispatch, device, payload);
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
      case 'fcm': {
        if (this.hasFirebaseAdminConfig()) {
          try {
            return await this.sendFcmAdmin(token, payload);
          } catch (error) {
            if (!this.fcmKey) {
              throw error;
            }
            this.logger.warn({
              msg: 'FCM admin initialization failed, falling back to legacy key',
              error: (error as Error).message,
            });
          }
        }
        if (!this.fcmKey) throw new Error('FCM credentials not configured');
        return this.sendFcmLegacy(token, payload);
      }
      case 'onesignal':
        if (!this.onesignalKey || !this.onesignalAppId) throw new Error('ONESIGNAL keys not configured');
        return this.sendOneSignal(token, payload);
      case 'apns':
        throw new Error('APNS provider not implemented');
      default:
        this.logger.debug({ msg: 'Mock push send', token, payload });
        return { receipt: { status: 'success', provider: 'mock', token, messageId: 'mock' }, channel: 'push' };
    }
  }

  private hasFirebaseAdminConfig() {
    return Boolean(this.fcmServiceAccountJson || this.fcmServiceAccountPath || this.fcmUseApplicationDefault);
  }

  private initFirebaseApp(): admin.app.App {
    if (this.firebaseApp) return this.firebaseApp;
    if (this.firebaseInitError) throw this.firebaseInitError;
    if (admin.apps.length) {
      this.firebaseApp = admin.app();
      return this.firebaseApp;
    }
    try {
      const serviceAccount = this.loadServiceAccount();
      if (serviceAccount) {
        this.firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        this.logger.log({ msg: 'Firebase admin initialized', source: 'serviceAccount' });
      } else {
        this.firebaseApp = admin.initializeApp();
        this.logger.log({ msg: 'Firebase admin initialized', source: 'applicationDefault' });
      }
    } catch (error) {
      const err = error as Error;
      this.firebaseInitError = err;
      this.logger.error({ msg: 'Firebase admin initialization failed', error: err.message });
      throw err;
    }
    return this.firebaseApp;
  }

  private loadServiceAccount(): admin.ServiceAccount | null {
    if (this.fcmServiceAccountJson) {
      return JSON.parse(this.fcmServiceAccountJson) as admin.ServiceAccount;
    }
    if (this.fcmServiceAccountPath) {
      const raw = fs.readFileSync(this.fcmServiceAccountPath, 'utf8');
      return JSON.parse(raw) as admin.ServiceAccount;
    }
    return null;
  }

  private normalizeDataForFcm(payload: NotificationPayload) {
    const data = this.normalizeData(payload);
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value === null) {
        normalized[key] = '';
        continue;
      }
      if (typeof value === 'string') {
        normalized[key] = value;
        continue;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        normalized[key] = String(value);
        continue;
      }
      normalized[key] = JSON.stringify(value);
    }
    return normalized;
  }

  private buildFcmMessage(token: string, payload: NotificationPayload): admin.messaging.Message {
    const data = this.normalizeDataForFcm(payload);
    const notification: admin.messaging.Notification = {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    };

    const androidNotification: admin.messaging.AndroidNotification = {
      ...(payload.channelId ? { channelId: payload.channelId } : {}),
      ...(payload.sound ? { sound: payload.sound } : {}),
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    };

    const android: admin.messaging.AndroidConfig = {
      ...(payload.priority ? { priority: payload.priority === 'high' ? 'high' : 'normal' } : {}),
      ...(Object.keys(androidNotification).length ? { notification: androidNotification } : {}),
    };

    const apnsPayload: admin.messaging.ApnsPayload = {
      aps: {
        ...(payload.sound ? { sound: payload.sound } : {}),
        ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      },
    };

    const apns: admin.messaging.ApnsConfig = {
      ...(payload.priority
        ? { headers: { 'apns-priority': payload.priority === 'high' ? '10' : '5' } }
        : {}),
      ...(Object.keys(apnsPayload.aps ?? {}).length ? { payload: apnsPayload } : {}),
      ...(payload.imageUrl ? { fcmOptions: { imageUrl: payload.imageUrl } } : {}),
    };

    return {
      token,
      data,
      notification,
      ...(Object.keys(android).length ? { android } : {}),
      ...(Object.keys(apns).length ? { apns } : {}),
    };
  }

  private async sendFcmAdmin(token: string, payload: NotificationPayload): Promise<DispatchResult> {
    const app = this.initFirebaseApp();
    const message = this.buildFcmMessage(token, payload);
    try {
      const messageId = await app.messaging().send(message, false);
      return {
        receipt: { status: 'success', provider: 'fcm', token, messageId },
        channel: 'push',
      };
    } catch (error: any) {
      const errorCode = error?.code ?? error?.errorInfo?.code ?? error?.errorInfo?.message ?? error?.message ?? 'fcm_failed';
      const deactivate = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token',
        'messaging/mismatched-credential',
      ].includes(String(errorCode));
      return {
        receipt: {
          status: 'failed',
          provider: 'fcm',
          token,
          error: typeof errorCode === 'string' ? errorCode : String(errorCode),
        },
        channel: 'push',
        deactivate,
      };
    }
  }

  private async sendFcmLegacy(token: string, payload: NotificationPayload): Promise<DispatchResult> {
    const data = this.normalizeData(payload);
    const notification: Record<string, any> = {
      title: payload.title,
      body: payload.body,
      sound: payload.sound,
      image: payload.imageUrl,
    };
    if (payload.channelId) notification.android_channel_id = payload.channelId;
    if (payload.badge !== undefined) notification.badge = payload.badge;
    try {
      const resp = await axios.post(
        'https://fcm.googleapis.com/fcm/send',
        {
          to: token,
          priority: payload.priority === 'high' ? 'high' : 'normal',
          notification,
          data,
        },
        { headers: { Authorization: `key=${this.fcmKey}`, 'Content-Type': 'application/json' } },
      );
      const result = Array.isArray(resp.data?.results) ? resp.data.results[0] : undefined;
      if (result?.error) {
        const error = String(result.error);
        const deactivate = ['NotRegistered', 'InvalidRegistration', 'MismatchSenderId'].includes(error);
        return {
          receipt: { status: 'failed', provider: 'fcm', token, error },
          channel: 'push',
          deactivate,
        };
      }
      const messageId = result?.message_id ?? resp.data?.message_id ?? resp.data?.name;
      return {
        receipt: { status: 'success', provider: 'fcm', token, messageId },
        channel: 'push',
      };
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error ?? error?.message ?? 'fcm_failed';
      return {
        receipt: {
          status: 'failed',
          provider: 'fcm',
          token,
          error: typeof errorMsg === 'string' ? errorMsg : String(errorMsg),
        },
        channel: 'push',
        deactivate: false,
      };
    }
  }

  private async sendOneSignal(token: string, payload: NotificationPayload): Promise<DispatchResult> {
    const data = this.normalizeData(payload);
    try {
      const resp = await axios.post(
        'https://api.onesignal.com/notifications',
        {
          app_id: this.onesignalAppId,
          include_player_ids: [token],
          headings: { en: payload.title ?? '' },
          contents: { en: payload.body ?? '' },
          data,
          ...(payload.channelId ? { android_channel_id: payload.channelId } : {}),
          ...(payload.badge !== undefined ? { ios_badgeType: 'SetTo', ios_badgeCount: payload.badge } : {}),
        },
        { headers: { Authorization: `Basic ${this.onesignalKey}`, 'Content-Type': 'application/json' } },
      );
      const invalid = Array.isArray(resp.data?.invalid_player_ids) ? resp.data.invalid_player_ids : [];
      const deactivate = invalid.includes(token);
      const messageId = resp.data?.id;
      const hasErrors = Boolean(resp.data?.errors) || resp.data?.recipients === 0;
      const status: DeliveryReceipt['status'] = deactivate || hasErrors ? 'failed' : 'success';
      return {
        receipt: {
          status,
          provider: 'onesignal',
          token,
          messageId,
          error: deactivate ? 'invalid_player_id' : hasErrors ? 'onesignal_no_recipients' : undefined,
        },
        channel: 'push',
        deactivate,
      };
    } catch (error: any) {
      const errorMsg = error?.response?.data?.errors ?? error?.message ?? 'onesignal_failed';
      return {
        receipt: {
          status: 'failed',
          provider: 'onesignal',
          token,
          error: Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg),
        },
        channel: 'push',
      };
    }
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
      vendorId: payload.vendorId,
      campaignId: payload.campaignId,
      route: payload.route,
      url: payload.url,
      channelId: payload.channelId,
      badge: payload.badge,
      priority: payload.priority ?? 'normal',
      sound: payload.sound,
      imageUrl: payload.imageUrl,
    } as Record<string, any>;
    if (payload.priority === 'high' && data.vibrate === undefined) {
      data.vibrate = 'default';
    }
    return data;
  }

  private async emitNotificationAnalytics(
    dispatch: DispatchResult,
    device: DeviceRecord,
    payload: NotificationPayload,
  ) {
    if (!this.analytics) return;
    const name = dispatch.receipt.status === 'success' ? 'NOTIF_SENT' : 'NOTIF_FAILED';
    const params = {
      notificationType: payload.type ?? payload.data?.type,
      orderId: payload.orderId ?? payload.data?.orderId,
      vendorId: payload.vendorId ?? payload.data?.vendorId,
      campaignId: payload.campaignId ?? payload.data?.campaignId,
      provider: dispatch.receipt.provider,
      messageId: dispatch.receipt.messageId,
      platform: device.platform,
      channel: dispatch.channel,
      error: dispatch.receipt.error,
    };
    try {
      await this.analytics.ingest(device.userId, {
        events: [{ name, ts: new Date(), params }],
        source: 'backend',
      });
    } catch (error) {
      this.logger.debug({ msg: 'Failed to record notification analytics', error: (error as Error).message });
    }
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
