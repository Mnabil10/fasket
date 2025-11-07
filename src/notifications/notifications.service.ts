import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  async enqueueOrderStatusPush(orderId: string, status: string) {
    // Hook in FCM/OneSignal here. For now, just log.
    console.log('[PUSH]', { orderId, status });
  }
}
