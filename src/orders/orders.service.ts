import { Injectable, Logger } from '@nestjs/common';
import { Prisma, OrderStatus, PaymentMethod, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, PaymentMethodDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DomainError, ErrorCode } from '../common/errors';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheService } from '../common/cache/cache.service';
import { AutomationEventsService, AutomationEventRef } from '../automation/automation-events.service';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    address: true;
    driver: {
      select: {
        id: true;
        fullName: true;
        phone: true;
      };
    };
    items: {
      select: {
        id: true;
        productId: true;
        productNameSnapshot: true;
        priceSnapshotCents: true;
        qty: true;
      };
    };
  };
}>;

type PublicStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly listTtl = Number(process.env.ORDER_LIST_CACHE_TTL ?? 30);
  private readonly receiptTtl = Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditLogService,
    private readonly cache: CacheService,
    private readonly automation: AutomationEventsService,
  ) {}

  async list(userId: string) {
    const cacheKey = this.cache.buildKey('orders:list', userId);
    const orders = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            code: true,
            totalCents: true,
            status: true,
            createdAt: true,
            loyaltyPointsUsed: true,
            loyaltyDiscountCents: true,
            loyaltyPointsEarned: true,
          },
        }),
      this.listTtl,
    );
    return orders.map((order) => ({
      id: order.id,
      code: order.code,
      totalCents: order.totalCents,
      status: this.toPublicStatus(order.status),
      createdAt: order.createdAt,
      loyaltyPointsUsed: order.loyaltyPointsUsed ?? 0,
      loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
      loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
    }));
  }

  async detail(userId: string, id: string) {
    const cacheKey = this.cache.buildKey('orders:detail', id, userId);
    const order = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findFirst({
          where: { id, userId },
          include: {
            address: true,
            driver: {
              select: { id: true, fullName: true, phone: true },
            },
            items: {
              select: {
                id: true,
                productId: true,
                productNameSnapshot: true,
                priceSnapshotCents: true,
                qty: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        }),
      this.listTtl,
    );
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const zone = order.deliveryZoneId
      ? await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true })
      : undefined;
    return this.toOrderDetail(order, zone);
  }

  async create(userId: string, payload: CreateOrderDto) {
    const idempotencyKey = payload.idempotencyKey?.trim() || null;
    const automationEvents: AutomationEventRef[] = [];

    if (idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { userId, idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        return this.detail(userId, existing.id);
      }
    }

    try {
      const { orderId } = await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: true },
      });
      if (!cart || cart.items.length === 0) {
        throw new DomainError(ErrorCode.CART_EMPTY, 'Cart is empty');
      }
      const couponCode = payload.couponCode ?? cart.couponCode ?? undefined;

      const productIds = cart.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: ProductStatus.ACTIVE, deletedAt: null },
        select: { id: true, name: true, stock: true, priceCents: true, salePriceCents: true, costPriceCents: true },
      });
      if (products.length !== productIds.length) {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'One or more products are unavailable');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const sourceItems = cart.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
        if (product.stock < item.qty) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Insufficient stock for ${product.name}`,
          );
        }
        if (!product.costPriceCents || product.costPriceCents <= 0) {
          this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: product.id });
        }
        return {
          productId: product.id,
          productName: product.name,
          qty: item.qty,
          priceCents: product.salePriceCents ?? product.priceCents,
          costCents: product.costPriceCents ?? 0,
        };
      });

      for (const item of sourceItems) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
        }

        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            stock: { gte: item.qty },
          },
          data: { stock: { decrement: item.qty } },
        });
        if (updated.count !== 1) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Insufficient stock for ${product.name || item.productId}`,
          );
        }

        const previousStock = product.stock;
        const newStock = previousStock - item.qty;
        product.stock = newStock;
        await tx.productStockLog.create({
          data: {
            productId: product.id,
            previousStock,
            newStock,
            delta: newStock - previousStock,
            reason: 'order.checkout',
            actorId: userId,
          },
        });
      }

      const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
      if (!address) {
        throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Invalid address');
      }

      const subtotalCents = sourceItems.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      const quote = await this.settings.computeDeliveryQuote({
        subtotalCents,
        zoneId: address.zoneId,
      });
      const deliveryZone = await this.settings.getZoneById(address.zoneId, { includeInactive: true });
      const shippingFeeCents = quote.shippingFeeCents;
      const deliveryZoneName = deliveryZone?.nameEn ?? deliveryZone?.nameAr ?? address.zoneId;
      const deliveryEtaMinutes = quote.etaMinutes ?? undefined;
      const estimatedDeliveryTime = quote.estimatedDeliveryTime ?? undefined;

      let discountCents = 0;
      if (couponCode) {
        const coupon = await tx.coupon.findFirst({ where: { code: couponCode, isActive: true } });
        const now = new Date();
        const active =
          coupon &&
          (!coupon.startsAt || coupon.startsAt <= now) &&
          (!coupon.endsAt || coupon.endsAt >= now) &&
          (!coupon.minOrderCents || subtotalCents >= coupon.minOrderCents);
        if (active) {
          if (coupon.type === 'PERCENT') {
            discountCents = Math.floor((subtotalCents * (coupon.valueCents ?? 0)) / 100);
          } else {
            discountCents = coupon.valueCents ?? 0;
          }
          if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
            discountCents = coupon.maxDiscountCents;
          }
          if (discountCents > subtotalCents) {
            discountCents = subtotalCents;
          }
          discountCents = Math.max(0, Math.round(discountCents));
        } else {
          throw new DomainError(ErrorCode.COUPON_EXPIRED, 'Coupon is invalid or expired');
        }
      }

      let totalCents = subtotalCents + shippingFeeCents - discountCents;
      const paymentMethod = payload.paymentMethod ?? PaymentMethodDto.COD;
      const code = await this.generateOrderCode(tx);
      const order = await tx.order.create({
        data: {
          userId,
          code,
          idempotencyKey,
          status: OrderStatus.PENDING,
          paymentMethod: paymentMethod as PaymentMethod,
          subtotalCents,
          shippingFeeCents,
          discountCents,
          totalCents,
          loyaltyDiscountCents: 0,
          loyaltyPointsUsed: 0,
          addressId: address.id,
          cartId: cart.id,
          notes: payload.note,
          couponCode,
          deliveryZoneId: address.zoneId,
          deliveryZoneName,
          deliveryEtaMinutes,
          estimatedDeliveryTime,
          items: {
            create: sourceItems.map((item) => ({
              productId: item.productId,
              productNameSnapshot: item.productName,
              priceSnapshotCents: item.priceCents,
              unitPriceCents: item.priceCents,
              unitCostCents: item.costCents ?? 0,
              lineTotalCents: item.priceCents * item.qty,
              lineProfitCents: (item.priceCents - (item.costCents ?? 0)) * item.qty,
              qty: item.qty,
            })),
          },
        },
      });

      if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0) {
        const redemption = await this.loyalty.redeemPoints({
          userId,
          pointsToRedeem: payload.loyaltyPointsToRedeem,
          subtotalCents: Math.max(subtotalCents - discountCents, 0),
          tx,
          orderId: order.id,
        });
        if (redemption.discountCents > 0) {
          totalCents = Math.max(totalCents - redemption.discountCents, 0);
          await tx.order.update({
            where: { id: order.id },
            data: {
              loyaltyDiscountCents: redemption.discountCents,
              loyaltyPointsUsed: redemption.pointsUsed,
              totalCents,
            },
          });
        }
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      if (cart.couponCode) {
        await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
      }
      const eventPayload = await this.buildOrderEventPayload(order.id, tx);
      const createdEvent = await this.automation.emit('order.created', eventPayload, {
        tx,
        dedupeKey: `order:${order.id}:${order.status}:created`,
      });
      automationEvents.push(createdEvent);
      return { orderId: order.id };
      });

      await this.automation.enqueueMany(automationEvents);
      this.logger.log({ msg: 'Order created', orderId, userId });
      await this.clearCachesForOrder(orderId, userId);
      return this.detail(userId, orderId);
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.order.findFirst({
          where: { userId, idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          return this.detail(userId, existing.id);
        }
      }
      // Roll back any stock decrements if the transaction failed before commit
      await this.rollbackStockFromCart(userId).catch(() => undefined);
      throw error;
    }
  }

  async awardLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const config = await this.settings.getLoyaltyConfig();
    if (!config.enabled || config.earnRate <= 0) {
      return 0;
    }

    const runner = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true, subtotalCents: true, loyaltyPointsEarned: true },
      });
      if (!order) return 0;
      if (order.status !== OrderStatus.DELIVERED) return 0;

      const existingTxn = await client.loyaltyTransaction.findFirst({
        where: { orderId, type: 'EARN' },
      });
      if (existingTxn) {
        if ((order.loyaltyPointsEarned ?? 0) === 0 && existingTxn.points > 0) {
          await client.order.update({
            where: { id: orderId },
            data: { loyaltyPointsEarned: existingTxn.points },
          });
        }
        return existingTxn.points ?? 0;
      }

      if ((order.loyaltyPointsEarned ?? 0) > 0) {
        return order.loyaltyPointsEarned ?? 0;
      }

      const earned = await this.loyalty.awardPoints({
        userId: order.userId,
        subtotalCents: order.subtotalCents,
        tx: client,
        orderId: order.id,
      });
      if (earned > 0) {
        await client.order.update({
          where: { id: order.id },
          data: { loyaltyPointsEarned: earned },
        });
      }
      return earned;
    };

    if (tx) {
      return runner(tx);
    }
    return this.prisma.$transaction(runner);
  }

  async revokeLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const runner = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, loyaltyPointsEarned: true },
      });
      if (!order || !order.loyaltyPointsEarned || order.loyaltyPointsEarned <= 0) {
        return 0;
      }

      const existingAdjustment = await client.loyaltyTransaction.findFirst({
        where: {
          orderId,
          type: 'ADJUST',
          metadata: { path: ['reason'], equals: 'order.cancel' },
        },
      });
      if (existingAdjustment) {
        return Math.abs(existingAdjustment.points ?? 0);
      }

      const user = await client.user.findUnique({
        where: { id: order.userId },
        select: { loyaltyPoints: true },
      });
      if (!user) return 0;

      const adjustment = Math.min(order.loyaltyPointsEarned, user.loyaltyPoints);
      const nextBalance = Math.max(0, user.loyaltyPoints - adjustment);

      await client.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: nextBalance },
      });
      await client.loyaltyTransaction.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: 'ADJUST',
          points: -adjustment,
          metadata: { reason: 'order.cancel' },
        },
      });
      return adjustment;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async assignDriverToOrder(orderId: string, driverId: string, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELED) {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
    }

    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        isActive: true,
        vehicle: { select: { type: true, plateNumber: true } },
      },
    });
    if (!driver) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
    }
    if (!driver.isActive) {
      throw new DomainError(ErrorCode.DRIVER_INACTIVE, 'Driver is inactive');
    }

    const automationEvents: AutomationEventRef[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: { driverId: driver.id, driverAssignedAt: new Date() },
        select: {
          id: true,
          userId: true,
          driverAssignedAt: true,
          driver: {
            select: { id: true, fullName: true, phone: true, vehicle: { select: { type: true, plateNumber: true } } },
          },
        },
      });

      const payload = await this.buildOrderEventPayload(orderId, tx);
      const event = await this.automation.emit('order.driver_assigned', payload, {
        tx,
        dedupeKey: `order:${orderId}:driver:${driver.id}`,
      });
      automationEvents.push(event);
      return next;
    });

    await this.audit.log({
      action: 'order.assign-driver',
      entity: 'order',
      entityId: orderId,
      actorId,
      before: { driverId: order.driverId ?? null },
      after: { driverId: driver.id },
    });

    await this.automation.enqueueMany(automationEvents);
    await this.clearCachesForOrder(orderId, updated.userId);

    return {
      orderId: updated.id,
      driverAssignedAt: updated.driverAssignedAt,
      driver: {
        id: updated.driver?.id ?? driver.id,
        fullName: updated.driver?.fullName ?? driver.fullName,
        phone: updated.driver?.phone ?? driver.phone,
        vehicleType: updated.driver?.vehicle?.type,
        plateNumber: updated.driver?.vehicle?.plateNumber,
      },
    };
  }

  async clearCachesForOrder(orderId: string, userId?: string) {
    const keys = [this.cache.buildKey('orders:detail', orderId, userId), this.cache.buildKey('orders:receipt', orderId)];
    if (userId) {
      keys.push(this.cache.buildKey('orders:list', userId));
    }
    await Promise.all(keys.map((key) => this.cache.del(key)));
  }

  private async generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    let attempts = 0;
    while (attempts < 5) {
      const code = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists = await tx.order.findUnique({ where: { code } });
      if (!exists) {
        return code;
      }
      attempts += 1;
    }
    return `ORD-${Date.now().toString(36).toUpperCase()}`;
  }

  async reorder(userId: string, fromOrderId: string) {
    const source = await this.prisma.order.findFirst({
      where: { id: fromOrderId, userId },
      include: {
        items: true,
        address: true,
      },
    });
    if (!source) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (!source.items.length) {
      throw new DomainError(ErrorCode.CART_EMPTY, 'Order has no items to reorder');
    }

    const automationEvents: AutomationEventRef[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const productIds = Array.from(new Set(source.items.map((i) => i.productId)));
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: ProductStatus.ACTIVE, deletedAt: null },
        select: { id: true, name: true, stock: true, priceCents: true, salePriceCents: true, costPriceCents: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const orderItems = source.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product unavailable: ${item.productNameSnapshot || item.productId}`,
          );
        }
        if ((product.stock ?? 0) < item.qty) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Insufficient stock for ${product.name}`,
          );
        }
        const priceCents = product.salePriceCents ?? product.priceCents;
        const costCents = product.costPriceCents ?? 0;
        if (!costCents || costCents <= 0) {
          this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: product.id });
        }
        return {
          productId: product.id,
          productName: product.name,
          qty: item.qty,
          priceCents,
          costCents,
        };
      });

      for (const item of orderItems) {
        await tx.product.updateMany({
          where: {
            id: item.productId,
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            stock: { gte: item.qty },
          },
          data: { stock: { decrement: item.qty } },
        });
        const product = productMap.get(item.productId)!;
        const previousStock = product.stock ?? 0;
        const newStock = previousStock - item.qty;
        productMap.set(item.productId, newStock as any);
        await tx.productStockLog.create({
          data: {
            productId: item.productId,
            previousStock,
            newStock,
            delta: newStock - previousStock,
            reason: 'order.reorder',
            actorId: userId,
          },
        });
      }

      const subtotalCents = orderItems.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      const address =
        source.address && source.address.userId === userId
          ? source.address
          : await tx.address.findFirst({
              where: { userId },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
            });
      if (!address) {
        throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'No address available for reorder');
      }

      const quote = await this.settings.computeDeliveryQuote({
        subtotalCents,
        zoneId: address.zoneId,
      });
      const deliveryZone = await this.settings.getZoneById(address.zoneId, { includeInactive: true });
      const shippingFeeCents = quote.shippingFeeCents;
      const deliveryZoneName = deliveryZone?.nameEn ?? deliveryZone?.nameAr ?? address.zoneId;

      const totalCents = subtotalCents + shippingFeeCents;
      const code = await this.generateOrderCode(tx);
      const order = await tx.order.create({
        data: {
          userId,
          code,
          status: OrderStatus.PENDING,
          paymentMethod: PaymentMethod.COD,
          subtotalCents,
          shippingFeeCents,
          discountCents: 0,
          totalCents,
          loyaltyDiscountCents: 0,
          loyaltyPointsUsed: 0,
          addressId: address.id,
          cartId: null,
          notes: 'Reorder',
          couponCode: null,
          deliveryZoneId: address.zoneId,
          deliveryZoneName,
          deliveryEtaMinutes: quote.etaMinutes ?? undefined,
          estimatedDeliveryTime: quote.estimatedDeliveryTime ?? undefined,
          items: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              productNameSnapshot: item.productName,
              priceSnapshotCents: item.priceCents,
              unitPriceCents: item.priceCents,
              unitCostCents: item.costCents ?? 0,
              lineTotalCents: item.priceCents * item.qty,
              lineProfitCents: (item.priceCents - (item.costCents ?? 0)) * item.qty,
              qty: item.qty,
            })),
          },
        },
      });

      const eventPayload = await this.buildOrderEventPayload(order.id, tx);
      const createdEvent = await this.automation.emit('order.created', eventPayload, {
        tx,
        dedupeKey: `order:${order.id}:${order.status}:reorder`,
      });
      automationEvents.push(createdEvent);

      return { orderId: order.id };
    }).catch(async (error) => {
      await this.rollbackStockForOrderItems(source.items).catch(() => undefined);
      throw error;
    });
    await this.automation.enqueueMany(automationEvents);
    await this.clearCachesForOrder(result.orderId, userId);
    return this.detail(userId, result.orderId);
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productId: true, qty: true, productNameSnapshot: true } },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.userId !== userId) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'You are not allowed to cancel this order', 403);
    }
    if (order.status === OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
    }
    if (order.status === OrderStatus.CANCELED) {
      await this.clearCachesForOrder(orderId, userId);
      return this.detail(userId, orderId);
    }

    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELED },
      });
      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          from: order.status,
          to: OrderStatus.CANCELED,
          note: 'Cancelled by customer',
          actorId: userId,
        },
      });
      await this.restockInventory(orderId, order.items, tx, userId);
      await this.refundRedeemedPoints(orderId, tx);
      await this.revokeLoyaltyForOrder(orderId, tx);
      const payload = await this.buildOrderEventPayload(orderId, tx);
      const event = await this.automation.emit('order.canceled', payload, {
        tx,
        dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
      });
      automationEvents.push(event);
    });

    await this.automation.enqueueMany(automationEvents);
    await this.clearCachesForOrder(orderId, userId);
    return this.detail(userId, orderId);
  }

  async updateStatus(orderId: string, nextStatus: OrderStatus, actorId?: string, note?: string) {
    const before = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!before) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (nextStatus === OrderStatus.CANCELED) {
      return this.adminCancelOrder(orderId, actorId, note);
    }
    let loyaltyEarned = 0;
    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: nextStatus } });
      const history = await tx.orderStatusHistory.create({
        data: { orderId, from: before.status as any, to: nextStatus as any, note: note ?? undefined, actorId },
      });
      if (nextStatus === OrderStatus.DELIVERED) {
        loyaltyEarned = await this.awardLoyaltyForOrder(orderId, tx);
      }
      const automationEvent = await this.emitOrderStatusAutomationEvent(
        tx,
        orderId,
        nextStatus,
        `order:${orderId}:${nextStatus}:${history.id}`,
      );
      if (automationEvent) automationEvents.push(automationEvent);
    });
    await this.automation.enqueueMany(automationEvents);
    await this.audit.log({
      action: 'order.status.change',
      entity: 'order',
      entityId: orderId,
      actorId,
      before: { status: before.status },
      after: { status: nextStatus, note },
    });
    await this.clearCachesForOrder(orderId, before.userId);
    return { success: true, loyaltyEarned };
  }

  async adminCancelOrder(orderId: string, actorId?: string, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { productId: true, qty: true, productNameSnapshot: true } } },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.status === OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
    }
    if (order.status === OrderStatus.CANCELED) {
      await this.clearCachesForOrder(orderId, order.userId);
      return { success: true };
    }

    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELED },
      });
      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          from: order.status,
          to: OrderStatus.CANCELED,
          note: note ?? 'Cancelled by admin',
          actorId,
        },
      });
      await this.restockInventory(orderId, order.items, tx, actorId);
      await this.refundRedeemedPoints(orderId, tx);
      await this.revokeLoyaltyForOrder(orderId, tx);
      const payload = await this.buildOrderEventPayload(orderId, tx);
      const event = await this.automation.emit('order.canceled', payload, {
        tx,
        dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
      });
      automationEvents.push(event);
    });

    await this.automation.enqueueMany(automationEvents);
    await this.audit.log({
      action: 'order.cancel',
      entity: 'order',
      entityId: orderId,
      actorId,
      before: { status: order.status },
      after: { status: OrderStatus.CANCELED },
    });
    await this.clearCachesForOrder(orderId, order.userId);
    return { success: true };
  }

  private async restockInventory(
    orderId: string,
    items: { productId: string; qty: number; productNameSnapshot?: string | null }[],
    tx: Prisma.TransactionClient,
    actorId?: string,
  ) {
    if (!items?.length) return;
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });
    const stockMap = new Map(products.map((p) => [p.id, p.stock ?? 0]));
    for (const item of items) {
      const previous = stockMap.get(item.productId) ?? 0;
      const next = previous + item.qty;
      await tx.product.updateMany({
        where: { id: item.productId },
        data: { stock: { increment: item.qty } },
      });
      await tx.productStockLog.create({
        data: {
          productId: item.productId,
          previousStock: previous,
          newStock: next,
          delta: item.qty,
          reason: 'order.cancel',
          actorId,
        },
      });
      stockMap.set(item.productId, next);
    }
  }

  private async refundRedeemedPoints(orderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { userId: true, loyaltyPointsUsed: true },
    });
    if (!order || !order.loyaltyPointsUsed || order.loyaltyPointsUsed <= 0) {
      return 0;
    }
    const existing = await tx.loyaltyTransaction.findFirst({
      where: {
        orderId,
        type: 'ADJUST',
        metadata: { path: ['reason'], equals: 'order.cancel.refund' },
      },
    });
    if (existing) return existing.points;

    const points = order.loyaltyPointsUsed;
    await tx.user.update({
      where: { id: order.userId },
      data: { loyaltyPoints: { increment: points } },
    });
    await tx.loyaltyTransaction.create({
      data: {
        userId: order.userId,
        orderId,
        type: 'ADJUST',
        points,
        metadata: { reason: 'order.cancel.refund' },
      },
    });
    return points;
  }

  private async rollbackStockFromCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (!cart?.items?.length) return;
    await this.rollbackStockForOrderItems(cart.items.map((i) => ({ productId: i.productId, qty: i.qty })));
  }

  private async rollbackStockForOrderItems(
    items: { productId: string; qty: number }[],
  ) {
    if (!items?.length) return;
    for (const item of items) {
      await this.prisma.product.updateMany({
        where: { id: item.productId },
        data: { stock: { increment: item.qty } },
      });
    }
  }

  private mapStatusToAutomationEvent(status: OrderStatus): string | null {
    switch (status) {
      case OrderStatus.PROCESSING:
        return 'order.confirmed';
      case OrderStatus.OUT_FOR_DELIVERY:
        return 'order.out_for_delivery';
      case OrderStatus.DELIVERED:
        return 'order.delivered';
      case OrderStatus.CANCELED:
        return 'order.canceled';
      default:
        return null;
    }
  }

  async emitOrderStatusAutomationEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    status: OrderStatus,
    dedupeKey: string,
  ) {
    const eventType = this.mapStatusToAutomationEvent(status);
    if (!eventType) return null;
    const payload = await this.buildOrderEventPayload(orderId, tx);
    return this.automation.emit(eventType, payload, {
      tx,
      dedupeKey,
    });
  }

  private async buildOrderEventPayload(
    orderId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { phone: true, name: true } },
        address: { select: { zoneId: true, label: true, city: true, street: true, building: true, apartment: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        items: { select: { productNameSnapshot: true, qty: true } },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const items = order.items.map((item) => ({
      name: item.productNameSnapshot,
      qty: item.qty,
    }));
    return {
      order_id: order.id,
      order_code: order.code ?? order.id,
      status: this.toPublicStatus(order.status),
      status_internal: order.status,
      customer_phone: order.user?.phone,
      total_cents: order.totalCents,
      total_formatted: (order.totalCents / 100).toFixed(2),
      payment_method: order.paymentMethod,
      items,
      items_summary: items.map((i) => `${i.name} x${i.qty}`).join(', '),
      delivery_zone: {
        id: order.deliveryZoneId,
        name: order.deliveryZoneName,
      },
      eta_minutes: order.deliveryEtaMinutes ?? null,
      estimated_delivery_time: order.estimatedDeliveryTime ?? null,
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.fullName,
            phone: order.driver.phone,
          }
        : null,
      address: order.address
        ? {
            label: order.address.label,
            city: order.address.city,
            street: order.address.street,
            building: order.address.building,
            apartment: order.address.apartment,
            zone_id: order.address.zoneId,
          }
        : null,
    };
  }

  private toPublicStatus(status: OrderStatus): PublicStatus {
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

  private toOrderDetail(order: OrderWithRelations, zone?: any) {
    return {
      id: order.id,
      code: order.code ?? order.id,
      userId: order.userId,
      status: this.toPublicStatus(order.status),
      paymentMethod: order.paymentMethod,
      subtotalCents: order.subtotalCents,
      shippingFeeCents: order.shippingFeeCents,
      discountCents: order.discountCents,
      loyaltyDiscountCents: order.loyaltyDiscountCents,
      loyaltyPointsUsed: order.loyaltyPointsUsed,
      loyaltyPointsEarned: (order as any).loyaltyPointsEarned ?? 0,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      note: order.notes ?? undefined,
      estimatedDeliveryTime: order.estimatedDeliveryTime ?? undefined,
      deliveryEtaMinutes: order.deliveryEtaMinutes ?? undefined,
      deliveryZoneId: order.deliveryZoneId ?? undefined,
      deliveryZoneName: order.deliveryZoneName ?? undefined,
      deliveryZone: zone
        ? {
            id: zone.id,
            nameEn: zone.nameEn,
            nameAr: zone.nameAr,
            city: zone.city,
            region: zone.region,
            feeCents: zone.feeCents,
            etaMinutes: zone.etaMinutes,
            isActive: zone.isActive,
            freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
            minOrderAmountCents: zone.minOrderAmountCents,
          }
        : undefined,
      address: order.address
        ? {
            id: order.address.id,
            label: order.address.label,
            city: order.address.city,
            zoneId: order.address.zoneId,
            street: order.address.street,
            building: order.address.building,
            apartment: order.address.apartment,
          }
        : null,
      driver: order.driver
        ? {
            id: order.driver.id,
            fullName: order.driver.fullName,
            phone: order.driver.phone,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        priceSnapshotCents: item.priceSnapshotCents,
        qty: item.qty,
      })),
      etag: order.updatedAt ? `${order.id}-${order.updatedAt.getTime()}` : order.id,
    };
  }
}
