import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStatus, PaymentMethod, ProductStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  list(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, totalCents: true, status: true, createdAt: true }
    });
  }

  detail(userId: string, id: string) {
    return this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true, address: true }
    });
  }

  async create(userId: string, payload: { addressId: string; paymentMethod: 'COD'|'CARD'; cartId?: string; items?: { productId: string; qty: number }[]; notes?: string; couponCode?: string }) {
    return this.prisma.$transaction(async (tx) => {
      // Determine source items: cartId -> items -> user's cart
      let sourceItems: { productId: string; qty: number; priceCents?: number }[] = [];
      let cartIdToClear: string | null = null;
      if (payload.cartId) {
        const cart = await tx.cart.findFirst({ where: { id: payload.cartId, userId }, include: { items: true } });
        if (!cart || cart.items.length === 0) throw new BadRequestException('Empty cart');
        sourceItems = cart.items.map(i => ({ productId: i.productId, qty: i.qty, priceCents: i.priceCents }));
        cartIdToClear = cart.id;
      } else if (payload.items && payload.items.length > 0) {
        // Validate requested products and resolve current price snapshots
        const byId = new Map<string, number>();
        for (const it of payload.items) {
          byId.set(it.productId, (byId.get(it.productId) ?? 0) + it.qty);
        }
        const products = await tx.product.findMany({ where: { id: { in: Array.from(byId.keys()) } } });
        if (products.length !== byId.size) throw new BadRequestException('One or more products not found');
        sourceItems = products.map(p => {
          const qty = byId.get(p.id)!;
          if (p.status !== 'ACTIVE' || p.stock < qty) throw new BadRequestException('Insufficient stock for ' + p.id);
          return { productId: p.id, qty, priceCents: p.salePriceCents ?? p.priceCents };
        });
      } else {
        const cart = await tx.cart.findUnique({ where: { userId }, include: { items: true } });
        if (!cart || cart.items.length === 0) throw new BadRequestException('Empty cart');
        sourceItems = cart.items.map(i => ({ productId: i.productId, qty: i.qty, priceCents: i.priceCents }));
        cartIdToClear = cart.id;
      }

      // Atomically decrement stock with guard to prevent race conditions
      for (const it of sourceItems) {
        const res = await tx.product.updateMany({
          where: { id: it.productId, status: ProductStatus.ACTIVE, stock: { gte: it.qty } },
          data: { stock: { decrement: it.qty } },
        });
        if (res.count !== 1) throw new BadRequestException('Insufficient stock for ' + it.productId);
      }

      const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
      if (!address) throw new BadRequestException('Invalid address');
      const subtotal = sourceItems.reduce((s, i) => s + (i.priceCents ?? 0) * i.qty, 0);
      const setting = await tx.setting.findFirst();
      const baseShipping = setting?.deliveryFeeCents ?? 0;
      const freeMin = setting?.freeDeliveryMinimumCents ?? 0;
      const shipping = freeMin > 0 && subtotal >= freeMin ? 0 : baseShipping;
      // Coupon discount
      let discount = 0;
      if (payload.couponCode) {
        const coupon = await tx.coupon.findFirst({ where: { code: payload.couponCode, isActive: true } });
        const now = new Date();
        const inWindow = coupon && (!coupon.startsAt || coupon.startsAt <= now) && (!coupon.endsAt || coupon.endsAt >= now);
        const meetsMin = coupon && (!coupon.minOrderCents || subtotal >= coupon.minOrderCents);
        if (coupon && inWindow && meetsMin) {
          if (coupon.type === 'PERCENT') {
            discount = Math.floor((subtotal * (coupon.valueCents ?? 0)) / 100);
          } else {
            discount = Math.min(subtotal, coupon.valueCents ?? 0);
          }
          if (coupon.maxDiscountCents && discount > coupon.maxDiscountCents) discount = coupon.maxDiscountCents;
        }
      }
      const total = subtotal + shipping - discount;

      // Build a productId -> name map to snapshot product names on order items
      const productIds = sourceItems.map(i => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(products.map(p => [p.id, p.name] as const));

      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentMethod: payload.paymentMethod as PaymentMethod,
          subtotalCents: subtotal,
          shippingFeeCents: shipping,
          discountCents: discount,
          totalCents: total,
          addressId: address.id,
          cartId: cartIdToClear ?? undefined,
          notes: payload.notes,
          couponCode: payload.couponCode,
          items: {
            create: sourceItems.map(i => ({
              productId: i.productId,
              productNameSnapshot: nameById.get(i.productId) ?? '',
              priceSnapshotCents: i.priceCents ?? 0,
              qty: i.qty,
            })),
          },
        },
      });

      if (cartIdToClear) {
        await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
      }

      await this.notify.enqueueOrderStatusPush(order.id, 'PENDING');
      return order;
    });
  }
}
