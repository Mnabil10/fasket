import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';

interface Threshold {
  status: OrderStatus;
  minutes: number;
}

@Injectable()
export class OrdersStuckWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersStuckWatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly scanIntervalMs: number;
  private readonly bucketMinutes = 15;
  private readonly thresholds: Threshold[];

  constructor(private readonly prisma: PrismaService, private readonly automation: AutomationEventsService) {
    this.scanIntervalMs = (Number(process.env.ORDER_STUCK_SCAN_MINUTES || 15) || 15) * 60 * 1000;
    this.thresholds = [
      { status: OrderStatus.PENDING, minutes: Number(process.env.ORDER_STUCK_PENDING_MINUTES || 30) || 30 },
      { status: OrderStatus.PROCESSING, minutes: Number(process.env.ORDER_STUCK_PROCESSING_MINUTES || 60) || 60 },
      { status: OrderStatus.OUT_FOR_DELIVERY, minutes: Number(process.env.ORDER_STUCK_OUT_FOR_DELIVERY_MINUTES || 120) || 120 },
    ];
  }

  async onModuleInit() {
    await this.scan();
    this.timer = setInterval(() => {
      this.scan().catch((err) => this.logger.error(err));
    }, this.scanIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async scan() {
    const now = Date.now();
    for (const threshold of this.thresholds) {
      const cutoff = new Date(now - threshold.minutes * 60 * 1000);
      const orders = await this.prisma.order.findMany({
        where: {
          status: threshold.status,
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          code: true,
          status: true,
          updatedAt: true,
          createdAt: true,
          user: { select: { phone: true } },
          deliveryZoneId: true,
          deliveryZoneName: true,
          totalCents: true,
        },
      });
      for (const order of orders) {
        const ageMinutes = Math.floor((now - (order.updatedAt?.getTime?.() ?? order.createdAt.getTime())) / 60000);
        const bucket = Math.floor(ageMinutes / this.bucketMinutes);
        const dedupeKey = `ops:order_stuck:${order.id}:${bucket}`;
        await this.automation.emit(
          'ops.order_stuck',
          {
            order_id: order.id,
            order_code: order.code ?? order.id,
            status_internal: order.status,
            status: this.toPublicStatus(order.status),
            threshold_minutes: threshold.minutes,
            age_minutes: ageMinutes,
            customer_phone: order.user?.phone,
            total_cents: order.totalCents,
            delivery_zone: { id: order.deliveryZoneId, name: order.deliveryZoneName },
            updated_at: order.updatedAt,
          },
          { dedupeKey },
        );
      }
    }
  }

  private toPublicStatus(status: OrderStatus): 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED' {
    switch (status) {
      case OrderStatus.PROCESSING:
        return 'CONFIRMED';
      case OrderStatus.OUT_FOR_DELIVERY:
        return 'DELIVERING';
      case OrderStatus.DELIVERED:
        return 'COMPLETED';
      case OrderStatus.CANCELED:
        return 'CANCELED';
      default:
        return 'PENDING';
    }
  }
}
