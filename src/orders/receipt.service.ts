import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderReceiptDto } from './dto/receipt.dto';
import { DomainError, ErrorCode } from '../common/errors';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getForCustomer(orderId: string, userId: string): Promise<OrderReceiptDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        address: true,
        driver: { select: { id: true, fullName: true, phone: true } },
        items: {
          select: {
            productId: true,
            productNameSnapshot: true,
            priceSnapshotCents: true,
            qty: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    return this.buildReceipt(order);
  }

  async getForAdmin(orderId: string): Promise<OrderReceiptDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        address: true,
        driver: { select: { id: true, fullName: true, phone: true } },
        items: {
          select: {
            productId: true,
            productNameSnapshot: true,
            priceSnapshotCents: true,
            qty: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    return this.buildReceipt(order);
  }

  private async buildReceipt(order: any): Promise<OrderReceiptDto> {
    const settings = await this.settings.getSettings();
    const zone =
      order.deliveryZoneId &&
      (await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true }));
    const items = order.items.map((item: any) => ({
      productId: item.productId,
      productName: item.productNameSnapshot,
      quantity: item.qty,
      unitPriceCents: item.priceSnapshotCents,
      lineTotalCents: item.priceSnapshotCents * item.qty,
    }));
    return {
      orderId: order.id,
      createdAt: order.createdAt,
      status: order.status,
      customer: {
        id: order.user?.id ?? order.userId,
        name: order.user?.name ?? '',
        phone: order.user?.phone ?? '',
      },
      address: {
        label: order.address?.label ?? undefined,
        street: order.address?.street ?? undefined,
        city: order.address?.city ?? undefined,
        region: order.address?.notes ?? undefined,
        zoneId: order.deliveryZoneId ?? order.address?.zoneId ?? undefined,
        zoneName: order.deliveryZoneName ?? zone?.nameEn ?? zone?.nameAr ?? undefined,
      },
      driver: order.driver
        ? { id: order.driver.id, fullName: order.driver.fullName, phone: order.driver.phone }
        : undefined,
      items,
      subtotalCents: order.subtotalCents,
      couponDiscountCents: order.discountCents ?? 0,
      shippingFeeCents: order.shippingFeeCents ?? 0,
      loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
      totalCents: order.totalCents,
      loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
      loyaltyPointsUsed: order.loyaltyPointsUsed ?? 0,
      currency: settings.currency,
    };
  }
}
