import { UserRole } from '@prisma/client';

export type TemplateKey =
  | 'order_created'
  | 'order_status_changed'
  | 'order_assigned_driver'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_canceled'
  | 'order_accepted'
  | 'order_preparing'
  | 'loyalty_earned'
  | 'loyalty_redeemed';

export type NotificationPriority = 'high' | 'normal';

export type NotificationChannel = 'push' | 'webpush' | 'whatsapp' | 'sms';

export type PushProvider = 'fcm' | 'onesignal' | 'apns' | 'webpush' | 'mock';

export type NotificationTarget =
  | { type: 'user'; userId: string }
  | { type: 'role'; role: UserRole }
  | { type: 'roles'; roles: UserRole[] }
  | { type: 'area'; areaId: string }
  | { type: 'provider'; providerId: string }
  | { type: 'broadcast' }
  | { type: 'devices'; deviceIds: string[] };

export interface NotificationPayload {
  title: string;
  body: string;
  type?: string;
  orderId?: string;
  priority?: NotificationPriority;
  sound?: string;
  imageUrl?: string;
  data?: Record<string, any>;
}

export interface DeliveryReceipt {
  status: 'success' | 'failed';
  provider: PushProvider;
  token: string;
  messageId?: string;
  error?: string;
}

export interface TemplateNotificationJob {
  kind: 'template';
  key: TemplateKey;
  userId: string;
  data: Record<string, any>;
  notificationId?: string;
}

export interface DirectNotificationJob {
  kind: 'direct';
  payload: NotificationPayload;
  target: NotificationTarget;
  notificationId?: string;
  cursor?: string;
  retryCount?: number;
  channel?: NotificationChannel;
}

export type NotificationJob = TemplateNotificationJob | DirectNotificationJob;
