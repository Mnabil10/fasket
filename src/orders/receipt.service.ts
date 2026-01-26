import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderReceiptDto } from './dto/receipt.dto';
import { DomainError, ErrorCode } from '../common/errors';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
  ) {}

  async getForCustomer(orderId: string, userId: string): Promise<OrderReceiptDto> {
    const cacheKey = this.cache.buildKey('orders:receipt', orderId, userId);
    const order = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findFirst({
          where: { id: orderId, userId },
          include: {
            user: { select: { id: true, name: true, phone: true } },
            address: true,
            deliveryWindow: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                vehicle: { select: { type: true, plateNumber: true } },
              },
            },
            items: {
              select: {
                productId: true,
                productNameSnapshot: true,
                priceSnapshotCents: true,
                unitPriceCents: true,
                lineTotalCents: true,
                qty: true,
                options: true,
                product: { select: { nameAr: true, pricingModel: true } },
              },
              orderBy: { id: 'asc' },
            },
          },
        }),
      Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60),
    );
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    return this.buildReceipt(order);
  }

  async getForAdmin(orderId: string): Promise<OrderReceiptDto> {
    const cacheKey = this.cache.buildKey('orders:receipt', orderId);
    const order = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { id: true, name: true, phone: true } },
            address: true,
            deliveryWindow: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                vehicle: { select: { type: true, plateNumber: true } },
              },
            },
            items: {
              select: {
                productId: true,
                productNameSnapshot: true,
                priceSnapshotCents: true,
                unitPriceCents: true,
                lineTotalCents: true,
                qty: true,
                options: true,
                product: { select: { nameAr: true, pricingModel: true } },
              },
              orderBy: { id: 'asc' },
            },
          },
        }),
      Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60),
    );
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    return this.buildReceipt(order);
  }

  private async buildReceipt(order: any): Promise<OrderReceiptDto> {
    const settings = await this.settings.getSettings();
    const guestAddress = order.guestAddress ?? null;
    const zone =
      order.deliveryZoneId &&
      (await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true }));
    const items = order.items.map((item: any) => {
      const unitPriceCents = item.unitPriceCents || item.priceSnapshotCents || 0;
      const lineTotalCents = item.lineTotalCents || unitPriceCents * item.qty;
      return {
        productId: item.productId,
        productName: item.productNameSnapshot,
        productNameAr: item.product?.nameAr ?? null,
        quantity: item.qty,
        priceSnapshotCents: item.priceSnapshotCents,
        unitPriceCents,
        lineTotalCents,
        options: (item.options ?? []).map((option: any) => ({
          optionId: option.optionId,
          name: option.optionNameSnapshot,
          nameAr: option.optionNameArSnapshot ?? null,
          priceSnapshotCents: option.priceSnapshotCents,
          qty: option.qty,
        })),
      };
    });
    const hasWeightBasedItems = order.items.some((item: any) => item.product?.pricingModel === 'weight');
    const resolvedZoneName = this.settings.resolveZoneName(zone, order.deliveryZoneName ?? undefined);
    const deliveryZone = zone
      ? {
          id: zone.id,
          name: resolvedZoneName ?? 'Delivery zone',
          city: zone.city ?? undefined,
          region: zone.region ?? undefined,
          deliveryFeeCents: zone.feeCents,
          freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents ?? null,
          minOrderCents: zone.minOrderAmountCents ?? null,
          etaMinutes: zone.etaMinutes ?? null,
          isActive: zone.isActive,
        }
      : order.deliveryZoneId || order.deliveryZoneName
        ? {
            id: order.deliveryZoneId ?? 'legacy',
            name: resolvedZoneName ?? order.deliveryZoneName ?? 'Delivery',
            city: order.address?.city ?? undefined,
            region: undefined,
            deliveryFeeCents: order.shippingFeeCents ?? 0,
            freeDeliveryThresholdCents: null,
            minOrderCents: null,
            etaMinutes: order.deliveryEtaMinutes ?? null,
            isActive: true,
          }
        : null;
    const driver = order.driver
      ? {
          id: order.driver.id,
          fullName: order.driver.fullName,
          phone: order.driver.phone,
          vehicleType: order.driver.vehicle?.type,
          plateNumber: order.driver.vehicle?.plateNumber,
        }
      : null;
    const deliveryBaseFeeCents = order.deliveryBaseFeeCents ?? order.shippingFeeCents ?? 0;
    const deliveryAppliedFeeCents =
      order.deliveryAppliedFeeCents ?? order.shippingFeeCents ?? deliveryBaseFeeCents;
    const deliveryCampaignId = order.deliveryCampaignId ?? null;
    const deliveryCampaignName = order.deliveryCampaignName ?? null;

    return {
      id: order.id,
      code: order.code ?? order.id,
      createdAt: order.createdAt,
      status: order.status,
      customer: {
        id: order.user?.id ?? order.userId ?? order.id,
        name: order.user?.name ?? order.guestName ?? '',
        phone: order.user?.phone ?? order.guestPhone ?? '',
      },
      address: {
        street: order.address?.street ?? guestAddress?.street ?? guestAddress?.fullAddress ?? undefined,
        city: order.address?.city ?? guestAddress?.city ?? undefined,
        region: order.address?.region ?? guestAddress?.region ?? order.address?.notes ?? undefined,
        building: order.address?.building ?? guestAddress?.building ?? undefined,
        apartment: order.address?.apartment ?? guestAddress?.apartment ?? undefined,
        notes: order.address?.notes ?? guestAddress?.notes ?? undefined,
        label: order.address?.label ?? guestAddress?.fullAddress ?? undefined,
      },
      orderNotes: order.note ?? order.notes ?? null,
      deliveryZoneId: order.deliveryZoneId ?? deliveryZone?.id ?? null,
      deliveryZoneName: resolvedZoneName ?? null,
      deliveryZone,
      driver,
      items,
      hasWeightBasedItems,
      subtotalCents: order.subtotalCents,
      couponDiscountCents: order.couponDiscountCents ?? order.discountCents ?? 0,
      loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
      shippingFeeCents: order.shippingFeeCents ?? 0,
      deliveryPricing: {
        baseFeeCents: deliveryBaseFeeCents,
        appliedFeeCents: deliveryAppliedFeeCents,
        campaignId: deliveryCampaignId,
        campaignName: deliveryCampaignName,
      },
      serviceFeeCents: order.serviceFeeCents ?? 0,
      totalCents: order.totalCents,
      loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
      loyaltyPointsRedeemed: order.loyaltyPointsUsed ?? 0,
      scheduledAt: order.scheduledAt ?? null,
      deliveryWindow: order.deliveryWindow
        ? {
            id: order.deliveryWindow.id,
            name: order.deliveryWindow.name,
            nameAr: order.deliveryWindow.nameAr ?? null,
            startMinutes: order.deliveryWindow.startMinutes,
            endMinutes: order.deliveryWindow.endMinutes,
            daysOfWeek: order.deliveryWindow.daysOfWeek,
            minLeadMinutes: order.deliveryWindow.minLeadMinutes ?? null,
            minOrderAmountCents: order.deliveryWindow.minOrderAmountCents ?? null,
          }
        : null,
      currency: settings.currency,
    };
  }
}
