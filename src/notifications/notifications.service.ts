import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { DeliveryDriver, NotificationStatus, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto';
import {
  NotificationChannel,
  NotificationJob,
  NotificationPayload,
  NotificationTarget,
  NotificationPriority,
  TemplateKey,
} from './notifications.types';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  WhatsappTemplateKey,
  WhatsappTemplateLanguage,
  normalizeWhatsappLanguage,
} from '../whatsapp/templates/whatsapp.templates';
import { NotificationsProcessor } from './notifications.processor';
import { SettingsService } from '../settings/settings.service';
import { NotificationsGateway } from './notifications.gateway';

type DispatchOptions = {
  notificationId?: string;
  channel?: NotificationChannel;
  delayMs?: number;
};

export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

export type AdminNotificationInput = {
  title: string;
  body: string;
  imageUrl?: string | null;
  type?: string | null;
  target: NotificationTarget;
  scheduledAt?: Date | null;
  createdById?: string | null;
  channel?: NotificationChannel;
  priority?: NotificationPriority;
  sound?: string | null;
  sendNow?: boolean;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly defaultPriority: NotificationPriority = 'normal';
  private readonly criticalPriority: NotificationPriority = 'high';
  private readonly criticalSound = 'alert';
  private readonly adminRoles: UserRole[] = [UserRole.ADMIN, UserRole.STAFF];

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly settings: SettingsService,
    @Optional() private readonly gateway?: NotificationsGateway,
    @InjectQueue('notifications') @Optional() private readonly queue?: Queue<NotificationJob>,
    @Optional() @Inject(forwardRef(() => NotificationsProcessor)) private readonly processor?: NotificationsProcessor,
  ) {}

  async notify(key: TemplateKey, userId: string, data: Record<string, any>) {
    await this.enqueue({ kind: 'template', key, userId, data });
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

  async registerDevice(userId: string, role: UserRole, dto: RegisterDeviceDto) {
    const normalizedLanguage = dto.language?.toLowerCase() ?? 'en';
    const now = new Date();
    const metadata = dto.preferences ? { preferences: dto.preferences } : undefined;
    const device = await this.prisma.notificationDevice.upsert({
      where: { token: dto.token },
      update: {
        userId,
        role,
        platform: dto.platform ?? 'unknown',
        language: normalizedLanguage,
        appVersion: dto.appVersion,
        deviceModel: dto.deviceModel,
        isActive: true,
        lastActiveAt: now,
        ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
      },
      create: {
        userId,
        role,
        token: dto.token,
        platform: dto.platform ?? 'unknown',
        language: normalizedLanguage,
        appVersion: dto.appVersion,
        deviceModel: dto.deviceModel,
        isActive: true,
        lastActiveAt: now,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
    this.logger.log({
      msg: 'Registered notification device',
      userId,
      platform: device.platform,
    });
    return { success: true, deviceId: device.id };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.notificationDevice.updateMany({
      where: { userId, token },
      data: { isActive: false },
    });
    this.logger.log({ msg: 'Unregistered notification device', userId });
    return { success: true };
  }

  async registerWebSubscription(userId: string, role: UserRole, payload: WebPushSubscriptionInput) {
    const now = new Date();
    const metadata = {
      webPush: payload.keys,
      userAgent: payload.userAgent ?? null,
    };
    const device = await this.prisma.notificationDevice.upsert({
      where: { token: payload.endpoint },
      update: {
        userId,
        role,
        platform: 'web',
        isActive: true,
        lastActiveAt: now,
        metadata: metadata as Prisma.InputJsonValue,
      },
      create: {
        userId,
        role,
        token: payload.endpoint,
        platform: 'web',
        isActive: true,
        lastActiveAt: now,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    return { success: true, deviceId: device.id };
  }

  async unregisterWebSubscription(userId: string, endpoint: string) {
    await this.prisma.notificationDevice.updateMany({
      where: { userId, token: endpoint },
      data: { isActive: false },
    });
    return { success: true };
  }

  async sendToUser(payload: NotificationPayload, userId: string, options: DispatchOptions = {}) {
    await this.enqueueDirect(payload, { type: 'user', userId }, options);
  }

  async sendToRole(payload: NotificationPayload, role: UserRole, options: DispatchOptions = {}) {
    await this.enqueueDirect(payload, { type: 'role', role }, options);
  }

  async sendToArea(payload: NotificationPayload, areaId: string, options: DispatchOptions = {}) {
    await this.enqueueDirect(payload, { type: 'area', areaId }, options);
  }

  async sendToProvider(payload: NotificationPayload, providerId: string, options: DispatchOptions = {}) {
    await this.enqueueDirect(payload, { type: 'provider', providerId }, options);
  }

  async broadcast(payload: NotificationPayload, options: DispatchOptions = {}) {
    await this.enqueueDirect(payload, { type: 'broadcast' }, options);
  }

  async schedule(payload: NotificationPayload, target: NotificationTarget, when: Date, options: DispatchOptions = {}) {
    const delayMs = Math.max(0, when.getTime() - Date.now());
    await this.enqueueDirect(payload, target, { ...options, delayMs });
  }

  async createAdminNotification(input: AdminNotificationInput) {
    const now = new Date();
    const scheduledAt = input.scheduledAt ?? null;
    const sendNow = Boolean(input.sendNow) || !scheduledAt || scheduledAt <= now;
    const status = sendNow ? NotificationStatus.SENDING : NotificationStatus.SCHEDULED;
    const payload = this.ensurePriority({
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? undefined,
      type: input.type ?? undefined,
      priority: input.priority ?? this.defaultPriority,
      sound: input.sound ?? undefined,
    });

    const notification = await this.prisma.notification.create({
      data: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl ?? null,
        type: payload.type ?? null,
        channel: input.channel ?? 'push',
        priority: payload.priority ?? null,
        sound: payload.sound ?? null,
        target: input.target as Prisma.InputJsonValue,
        status,
        scheduledAt: sendNow ? null : scheduledAt,
        createdById: input.createdById ?? null,
      },
    });

    if (sendNow) {
      await this.enqueueDirect(payload, input.target, {
        notificationId: notification.id,
        channel: input.channel ?? 'push',
      });
    } else if (scheduledAt) {
      await this.enqueueDirect(payload, input.target, {
        notificationId: notification.id,
        channel: input.channel ?? 'push',
        delayMs: Math.max(0, scheduledAt.getTime() - Date.now()),
      });
    }

    return notification;
  }

  async sendAdminNotificationNow(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      return { success: false, message: 'Notification not found' };
    }
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENDING, scheduledAt: null },
    });
    const payload = this.ensurePriority({
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl ?? undefined,
      type: notification.type ?? undefined,
      priority: (notification.priority as NotificationPriority | null) ?? this.defaultPriority,
      sound: notification.sound ?? undefined,
    });
    const target = notification.target as NotificationTarget;
    await this.enqueueDirect(payload, target, {
      notificationId: notification.id,
      channel: (notification.channel as NotificationChannel) ?? 'push',
    });
    return { success: true };
  }

  async notifyOrderCreated(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, code: true, userId: true, providerId: true },
    });
    if (!order) return;
    const code = order.code ?? order.id;
    if (order.providerId) {
      await this.sendToProvider(
        this.ensureCritical({
          title: 'New order',
          body: `Order #${code} is ready for confirmation.`,
          type: 'order_created',
          orderId: order.id,
          data: { orderCode: code },
        }),
        order.providerId,
      );
    }
    await this.notifyAdminEvent({
      title: 'New order',
      body: `Order #${code} was created.`,
      type: 'admin_order_created',
      data: { orderId: order.id, orderCode: code },
    });
    await this.notifyOrderCreatedWhatsapp(orderId);
  }

  async notifyOrderStatusChange(
    orderId: string,
    status: OrderStatus,
    context?: { previousStatus?: OrderStatus; actorId?: string; reason?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, code: true, userId: true, providerId: true, driverId: true },
    });
    if (!order) return;
    const code = order.code ?? order.id;

    const customerPayload = (title: string, body: string) =>
      this.ensureCritical({
        title,
        body,
        type: 'order_status',
        orderId: order.id,
        data: { orderCode: code, status },
      });

    if (order.userId) {
      if (status === OrderStatus.CONFIRMED) {
        await this.sendToUser(customerPayload('Order accepted', `Order #${code} has been accepted.`), order.userId);
      } else if (status === OrderStatus.PREPARING) {
        await this.sendToUser(customerPayload('Order preparing', `Order #${code} is being prepared.`), order.userId);
      } else if (status === OrderStatus.OUT_FOR_DELIVERY) {
        await this.sendToUser(customerPayload('Out for delivery', `Order #${code} is on the way.`), order.userId);
      } else if (status === OrderStatus.DELIVERED) {
        await this.sendToUser(customerPayload('Order delivered', `Order #${code} was delivered.`), order.userId);
      } else if (status === OrderStatus.CANCELED) {
        await this.sendToUser(customerPayload('Order canceled', `Order #${code} was canceled.`), order.userId);
      } else if (status === OrderStatus.DELIVERY_FAILED) {
        await this.sendToUser(customerPayload('Delivery failed', `Delivery failed for order #${code}.`), order.userId);
      }
    }

    if (status === OrderStatus.OUT_FOR_DELIVERY && order.driverId) {
      const driverUser = await this.prisma.deliveryDriver.findUnique({
        where: { id: order.driverId },
        select: { userId: true },
      });
      if (driverUser?.userId) {
        await this.sendToUser(
          this.ensureCritical({
            title: 'Delivery assigned',
            body: `Order #${code} is ready for delivery.`,
            type: 'driver_order',
            orderId: order.id,
            data: { orderCode: code, status },
          }),
          driverUser.userId,
        );
      }
    }

    if (status === OrderStatus.CANCELED && order.providerId) {
      await this.sendToProvider(
        this.ensureCritical({
          title: 'Order canceled',
          body: `Order #${code} was canceled.`,
          type: 'order_canceled',
          orderId: order.id,
          data: { orderCode: code, status, reason: context?.reason ?? null },
        }),
        order.providerId,
      );
      await this.notifyAdminEvent({
        title: 'Order canceled',
        body: `Order #${code} was canceled.`,
        type: 'admin_order_canceled',
        data: { orderId: order.id, orderCode: code, reason: context?.reason ?? null },
      });
      await this.notifyOrderCancelledWhatsapp(orderId, context?.reason);
      return;
    }

    if (
      status === OrderStatus.CONFIRMED ||
      status === OrderStatus.PREPARING ||
      status === OrderStatus.OUT_FOR_DELIVERY ||
      status === OrderStatus.DELIVERED ||
      status === OrderStatus.DELIVERY_FAILED
    ) {
      await this.notifyOrderStatusWhatsapp(orderId);
    }
  }

  async notifyAdminEvent(event: { title: string; body: string; type?: string; data?: Record<string, any> }) {
    const payload = this.ensureCritical({
      title: event.title,
      body: event.body,
      type: event.type ?? 'admin_alert',
      data: event.data,
    });
    await Promise.all(this.adminRoles.map((role) => this.sendToRole(payload, role)));
    if (this.gateway) {
      this.gateway.emitAdminNotification({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: payload.title,
        body: payload.body,
        type: payload.type ?? 'admin_alert',
        data: payload.data ?? {},
        createdAt: new Date().toISOString(),
        priority: payload.priority ?? this.defaultPriority,
      });
    }
  }

  async sendWhatsappTemplate(params: {
    to: string;
    template: WhatsappTemplateKey;
    variables: Record<string, string | number | null | undefined>;
    language?: WhatsappTemplateLanguage;
    metadata?: Record<string, any>;
  }) {
    return this.whatsapp.sendTemplate({
      to: params.to,
      template: params.template,
      variables: params.variables,
      language: params.language,
      metadata: params.metadata,
    });
  }

  async sendWhatsappText(params: { to: string; body: string; metadata?: Record<string, any> }) {
    return this.whatsapp.sendText({
      to: params.to,
      body: params.body,
      metadata: params.metadata,
    });
  }

  async sendWhatsappDocument(params: { to: string; link: string; filename?: string; metadata?: Record<string, any> }) {
    return this.whatsapp.sendDocument({
      to: params.to,
      link: params.link,
      filename: params.filename,
      metadata: params.metadata,
    });
  }

  private async enqueueDirect(payload: NotificationPayload, target: NotificationTarget, options: DispatchOptions = {}) {
    const job: NotificationJob = {
      kind: 'direct',
      payload: this.ensurePriority(payload),
      target,
      notificationId: options.notificationId,
      channel: options.channel,
    };
    await this.enqueue(job, options.delayMs);
  }

  private async enqueue(payload: NotificationJob, delayMs?: number) {
    const queueDisabled = (this.queue as any)?.__notificationsDisabled === true;
    if (!this.queue || queueDisabled) {
      if (!this.processor) {
        this.logger.warn({ msg: 'Notification processor unavailable; dropping job', payload });
        return;
      }
      await this.processor.handle(payload);
      return;
    }
    try {
      await this.queue.add('send', payload, {
        delay: delayMs,
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn({ msg: 'Notification queue unavailable, dropping job', error: msg, payload });
    }
  }

  private ensurePriority(payload: NotificationPayload): NotificationPayload {
    const priority = payload.priority ?? this.defaultPriority;
    const sound = payload.sound ?? (priority === 'high' ? this.criticalSound : undefined);
    const data = {
      ...(payload.data ?? {}),
      priority,
      sound,
      type: payload.type ?? payload.data?.type,
      orderId: payload.orderId ?? payload.data?.orderId,
    };
    return {
      ...payload,
      priority,
      sound,
      data,
    };
  }

  private ensureCritical(payload: NotificationPayload): NotificationPayload {
    return this.ensurePriority({
      ...payload,
      priority: this.criticalPriority,
      sound: payload.sound ?? this.criticalSound,
    });
  }

  private async notifyOrderCreatedWhatsapp(orderId: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
      await this.sendProviderNewOrderWhatsapp(context, lang, settings);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order created notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async notifyOrderStatusWhatsapp(orderId: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order status notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async notifyOrderCancelledWhatsapp(orderId: string, reason?: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
      await this.sendProviderOrderCancelledWhatsapp(context, lang, reason ?? undefined);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order cancel notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async loadOrderWhatsappContext(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        status: true,
        deliveryEtaMinutes: true,
        estimatedDeliveryTime: true,
        totalCents: true,
        notes: true,
        guestPhone: true,
        user: { select: { phone: true } },
        providerId: true,
        provider: { select: { contactPhone: true } },
        items: { select: { qty: true } },
      },
    });
  }

  private async sendCustomerOrderStatusWhatsapp(
    order: {
      id: string;
      code: string | null;
      status: OrderStatus;
      deliveryEtaMinutes: number | null;
      estimatedDeliveryTime: string | null;
      guestPhone: string | null;
      user: { phone: string } | null;
    },
    lang: WhatsappTemplateLanguage,
    settings: { contactPhone?: string | null },
  ) {
    const phone = order.user?.phone ?? order.guestPhone;
    if (!phone) return;
    const idempotencyKey = `order:${order.id}:status:${order.status}`;
    const existing = await this.prisma.whatsAppMessageLog.findFirst({
      where: {
        direction: 'OUTBOUND',
        payload: { path: ['metadata', 'idempotencyKey'], equals: idempotencyKey },
      },
    });
    if (existing) return;
    const eta = this.localizeEta(lang, order.deliveryEtaMinutes ?? undefined) || order.estimatedDeliveryTime || '';
    const supportHint = this.buildSupportHint(settings, lang);
    await this.sendWhatsappTemplate({
      to: phone,
      template: 'order_status_update_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        status: this.localizeOrderStatus(order.status, lang),
        eta,
        support_hint: supportHint,
      },
      metadata: { orderId: order.id, status: order.status, idempotencyKey },
    });
  }

  private async sendProviderNewOrderWhatsapp(
    order: {
      id: string;
      code: string | null;
      notes: string | null;
      totalCents: number;
      providerId: string | null;
      provider: { contactPhone: string | null } | null;
      items: Array<{ qty: number }>;
    },
    lang: WhatsappTemplateLanguage,
    settings: { currency?: string | null },
  ) {
    if (!order.providerId) return;
    const enabled = await this.isProviderWhatsappEnabled(order.providerId, 'newOrders');
    if (!enabled) return;
    const phone = await this.resolveProviderWhatsappPhone(order.providerId, order.provider?.contactPhone ?? null);
    if (!phone) return;
    const itemsCount = order.items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
    const currency = settings.currency ?? 'EGP';
    const totalAmount = `${currency} ${(order.totalCents / 100).toFixed(2)}`;
    await this.sendWhatsappTemplate({
      to: phone,
      template: 'provider_new_order_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        items_count: itemsCount,
        total_amount: totalAmount,
        notes: order.notes ?? '-',
      },
      metadata: { orderId: order.id },
    });
  }

  private async sendProviderOrderCancelledWhatsapp(
    order: {
      id: string;
      code: string | null;
      providerId: string | null;
      provider: { contactPhone: string | null } | null;
    },
    lang: WhatsappTemplateLanguage,
    reason?: string,
  ) {
    if (!order.providerId) return;
    const enabled = await this.isProviderWhatsappEnabled(order.providerId, 'newOrders');
    if (!enabled) return;
    const phone = await this.resolveProviderWhatsappPhone(order.providerId, order.provider?.contactPhone ?? null);
    if (!phone) return;
    await this.sendWhatsappTemplate({
      to: phone,
      template: 'provider_order_cancelled_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        reason: reason ?? 'Canceled',
      },
      metadata: { orderId: order.id },
    });
  }

  private resolveWhatsappLanguage(value?: string | null): WhatsappTemplateLanguage {
    return normalizeWhatsappLanguage(value ?? undefined);
  }

  private localizeOrderStatus(status: OrderStatus, lang: WhatsappTemplateLanguage) {
    const mapping: Record<OrderStatus, { en: string; ar: string }> = {
      PENDING: { en: 'Pending', ar: '\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631' },
      CONFIRMED: { en: 'Confirmed', ar: '\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0637\u0644\u0628' },
      PREPARING: { en: 'Preparing', ar: '\u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631' },
      OUT_FOR_DELIVERY: { en: 'Out for delivery', ar: '\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642' },
      DELIVERY_FAILED: { en: 'Delivery failed', ar: '\u0641\u0634\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      DELIVERED: { en: 'Delivered', ar: '\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      CANCELED: { en: 'Canceled', ar: '\u062A\u0645 \u0627\u0644\u0625\u0644\u063A\u0627\u0621' },
    };
    const label = mapping[status] ?? { en: status, ar: status };
    return lang === 'ar' ? label.ar : label.en;
  }

  private localizeEta(lang: WhatsappTemplateLanguage, minutes?: number) {
    if (!minutes || minutes <= 0) return '';
    if (lang === 'ar') {
      return `\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u062A\u0648\u0642\u0639: ${minutes} \u062F\u0642\u064A\u0642\u0629`;
    }
    return `ETA: ${minutes} min`;
  }

  private buildSupportHint(settings: { contactPhone?: string | null }, lang: WhatsappTemplateLanguage) {
    if (settings.contactPhone) {
      return lang === 'ar'
        ? `\u062F\u0639\u0645: ${settings.contactPhone}`
        : `Support: ${settings.contactPhone}`;
    }
    return lang === 'ar'
      ? '\u0627\u0631\u062F \u0628\u0643\u0644\u0645\u0629 \u0645\u0633\u0627\u0639\u062F\u0629 \u0644\u0644\u062F\u0639\u0645'
      : 'Reply HELP for support';
  }

  private async resolveProviderWhatsappPhone(providerId: string, fallback?: string | null) {
    if (fallback) return fallback;
    const owner = await this.prisma.providerUser.findFirst({
      where: { providerId, role: { in: ['OWNER', 'MANAGER'] } },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { phone: true } } },
    });
    return owner?.user?.phone ?? null;
  }

  private async isProviderWhatsappEnabled(providerId: string, key: 'newOrders' | 'invoiceUpdates') {
    const preference = await this.prisma.providerNotificationPreference.findUnique({ where: { providerId } });
    const payload = preference?.preferences as Record<string, any> | undefined;
    const channel = payload?.[key];
    if (channel && typeof channel === 'object' && 'whatsapp' in channel) {
      return Boolean(channel.whatsapp);
    }
    return true;
  }
}
