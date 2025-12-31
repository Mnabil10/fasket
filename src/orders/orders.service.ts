import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryMode,
  OrderSplitFailurePolicy,
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderSplitFailurePolicyDto, PaymentMethodDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DomainError, ErrorCode } from '../common/errors';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheService } from '../common/cache/cache.service';
import { AutomationEventsService, AutomationEventRef } from '../automation/automation-events.service';
import { BillingService } from '../billing/billing.service';

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
  private readonly defaultProviderId = 'prov_default';
  private readonly defaultBranchId = 'branch_default';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditLogService,
    private readonly cache: CacheService,
    private readonly automation: AutomationEventsService,
    private readonly billing: BillingService,
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
    const splitPolicy =
      (payload.splitFailurePolicy ?? OrderSplitFailurePolicyDto.PARTIAL) as OrderSplitFailurePolicy;
    const automationEvents: AutomationEventRef[] = [];

    if (idempotencyKey) {
      const existingGroup = await this.prisma.orderGroup.findFirst({
        where: { userId, idempotencyKey },
        select: { id: true },
      });
      if (existingGroup) {
        return this.getOrderGroupSummary(userId, existingGroup.id);
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
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
          select: {
            id: true,
            name: true,
            stock: true,
            priceCents: true,
            salePriceCents: true,
            costPriceCents: true,
            providerId: true,
          },
        });
        if (products.length !== productIds.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'One or more products are unavailable');
        }

        const productMap = new Map(products.map((product) => [product.id, product]));
        const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
        if (!address) {
          throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Invalid address');
        }
        if (address.lat === null || address.lat === undefined || address.lng === null || address.lng === undefined) {
          throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Address location is required');
        }

        const explicitBranchIds = Array.from(
          new Set(cart.items.map((item) => item.branchId).filter(Boolean) as string[]),
        );
        const explicitBranches = explicitBranchIds.length
          ? await tx.branch.findMany({
              where: { id: { in: explicitBranchIds } },
              include: { provider: { select: { id: true, deliveryMode: true } } },
            })
          : [];
        const branchById = new Map(explicitBranches.map((branch) => [branch.id, branch]));

        const providerIdsNeeded = new Set<string>();
        for (const item of cart.items) {
          if (!item.branchId) {
            const product = productMap.get(item.productId);
            if (product) {
              providerIdsNeeded.add(product.providerId ?? this.defaultProviderId);
            }
          }
        }

        const providerBranches = providerIdsNeeded.size
          ? await tx.branch.findMany({
              where: { providerId: { in: Array.from(providerIdsNeeded) }, status: 'ACTIVE' },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
              include: { provider: { select: { id: true, deliveryMode: true } } },
            })
          : [];
        const defaultBranchByProvider = new Map<string, (typeof providerBranches)[number]>();
        for (const branch of providerBranches) {
          if (!defaultBranchByProvider.has(branch.providerId)) {
            defaultBranchByProvider.set(branch.providerId, branch);
          }
        }
        const fallbackBranch = await tx.branch.findUnique({
          where: { id: this.defaultBranchId },
          include: { provider: { select: { id: true, deliveryMode: true } } },
        });

        const branchErrors = new Map<string, string>();
        const resolvedItems: Array<{
          cartItemId: string;
          product: {
            id: string;
            name: string;
            stock: number;
            priceCents: number;
            salePriceCents: number | null;
            costPriceCents: number | null;
            providerId: string | null;
          };
          branch: {
            id: string;
            providerId: string;
            status: string;
            deliveryMode: DeliveryMode | null;
            provider?: { id: string; deliveryMode: DeliveryMode } | null;
          };
          qty: number;
        }> = [];

        for (const item of cart.items) {
          const product = productMap.get(item.productId);
          if (!product) {
            branchErrors.set(item.branchId ?? 'unknown', 'Product unavailable');
            continue;
          }
          let branch =
            (item.branchId ? branchById.get(item.branchId) : undefined) ??
            defaultBranchByProvider.get(product.providerId ?? this.defaultProviderId) ??
            (fallbackBranch ?? undefined);
          if (!branch || branch.status !== 'ACTIVE') {
            branchErrors.set(item.branchId ?? branch?.id ?? 'unknown', 'Branch unavailable');
            continue;
          }
          if (product.providerId && branch.providerId !== product.providerId) {
            branchErrors.set(branch.id, 'Branch does not match product provider');
            continue;
          }
          if (!item.branchId) {
            await tx.cartItem.update({ where: { id: item.id }, data: { branchId: branch.id } });
          }
          resolvedItems.push({
            cartItemId: item.id,
            product,
            branch,
            qty: item.qty,
          });
        }

        const branchPairs = resolvedItems.map((item) => ({
          branchId: item.branch.id,
          productId: item.product.id,
        }));
        const branchProducts = branchPairs.length
          ? await tx.branchProduct.findMany({
              where: { OR: branchPairs },
            })
          : [];
        const branchProductMap = new Map(
          branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
        );

        const validItems: Array<{
          cartItemId: string;
          branchId: string;
          providerId: string;
          productId: string;
          productName: string;
          qty: number;
          priceCents: number;
          costCents: number;
          branch: {
            id: string;
            providerId: string;
            deliveryMode: DeliveryMode | null;
            provider?: { id: string; deliveryMode: DeliveryMode } | null;
          };
        }> = [];

        for (const item of resolvedItems) {
          const branchProduct = branchProductMap.get(`${item.branch.id}:${item.product.id}`);
          if (!branchProduct || !branchProduct.isActive) {
            branchErrors.set(item.branch.id, 'Product unavailable in this branch');
            continue;
          }
          const stock = branchProduct.stock ?? item.product.stock ?? 0;
          if (stock < item.qty) {
            branchErrors.set(item.branch.id, `Insufficient stock for ${item.product.name}`);
            continue;
          }
          if (!item.product.costPriceCents || item.product.costPriceCents <= 0) {
            this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: item.product.id });
          }
          const priceCents =
            branchProduct.salePriceCents ??
            branchProduct.priceCents ??
            item.product.salePriceCents ??
            item.product.priceCents;
          validItems.push({
            cartItemId: item.cartItemId,
            branchId: item.branch.id,
            providerId: item.branch.providerId,
            productId: item.product.id,
            productName: item.product.name,
            qty: item.qty,
            priceCents,
            costCents: item.product.costPriceCents ?? 0,
            branch: item.branch,
          });
        }

        if (branchErrors.size > 0 && splitPolicy === OrderSplitFailurePolicy.CANCEL_GROUP) {
          const message = Array.from(branchErrors.values())[0] ?? 'Some items are unavailable';
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, message);
        }

        const filteredItems = validItems.filter((item) => !branchErrors.has(item.branchId));
        if (!filteredItems.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
        }

        const grouped = new Map<
          string,
          { branch: (typeof filteredItems)[number]['branch']; providerId: string; items: typeof filteredItems; subtotalCents: number }
        >();
        for (const item of filteredItems) {
          const existing = grouped.get(item.branchId);
          if (!existing) {
            grouped.set(item.branchId, {
              branch: item.branch,
              providerId: item.providerId,
              items: [item],
              subtotalCents: item.priceCents * item.qty,
            });
          } else {
            existing.items.push(item);
            existing.subtotalCents += item.priceCents * item.qty;
          }
        }

        if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0 && grouped.size > 1) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'Loyalty redemption is not supported for multi-provider orders',
          );
        }

        const subtotalCentsTotal = Array.from(grouped.values()).reduce((sum, group) => sum + group.subtotalCents, 0);
        let discountCents = 0;
        let couponScope: { scope?: string | null; providerId?: string | null; branchId?: string | null } | null = null;
        if (couponCode) {
          const coupon = await tx.coupon.findFirst({ where: { code: couponCode, isActive: true } });
          const now = new Date();
          const active =
            coupon &&
            (!coupon.startsAt || coupon.startsAt <= now) &&
            (!coupon.endsAt || coupon.endsAt >= now) &&
            (!coupon.minOrderCents || subtotalCentsTotal >= coupon.minOrderCents);
          if (!active || !coupon) {
            throw new DomainError(ErrorCode.COUPON_EXPIRED, 'Coupon is invalid or expired');
          }

          couponScope = {
            scope: coupon.scope ?? null,
            providerId: coupon.providerId ?? null,
            branchId: coupon.branchId ?? null,
          };
          if (coupon.scope === 'PROVIDER' && coupon.providerId) {
            const allProviderIds = Array.from(grouped.values()).map((group) => group.providerId);
            if (allProviderIds.some((pid) => pid !== coupon.providerId)) {
              throw new DomainError(ErrorCode.COUPON_INVALID, 'Coupon is not valid for this provider');
            }
          }
          if (coupon.scope === 'BRANCH' && coupon.branchId) {
            const allBranchIds = Array.from(grouped.keys());
            if (allBranchIds.some((bid) => bid !== coupon.branchId)) {
              throw new DomainError(ErrorCode.COUPON_INVALID, 'Coupon is not valid for this branch');
            }
          }

          if (coupon.type === 'PERCENT') {
            discountCents = Math.floor((subtotalCentsTotal * (coupon.valueCents ?? 0)) / 100);
          } else {
            discountCents = coupon.valueCents ?? 0;
          }
          if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
            discountCents = coupon.maxDiscountCents;
          }
          if (discountCents > subtotalCentsTotal) {
            discountCents = subtotalCentsTotal;
          }
          discountCents = Math.max(0, Math.round(discountCents));
        }

        const groupEntries = Array.from(grouped.entries());
        const discountByBranch = this.allocateDiscounts(discountCents, groupEntries);

        let shippingFeeCentsTotal = 0;
        const shippingByBranch = new Map<string, { fee: number; distanceKm: number; ratePerKmCents: number }>();
        for (const [branchId] of groupEntries) {
          const quote = await this.settings.computeBranchDeliveryQuote({
            branchId,
            addressLat: address.lat!,
            addressLng: address.lng!,
          });
          shippingFeeCentsTotal += quote.shippingFeeCents;
          shippingByBranch.set(branchId, {
            fee: quote.shippingFeeCents,
            distanceKm: quote.distanceKm,
            ratePerKmCents: quote.ratePerKmCents,
          });
        }

        const paymentMethod = payload.paymentMethod ?? PaymentMethodDto.COD;
        const orderGroup = await tx.orderGroup.create({
          data: {
            userId,
            idempotencyKey,
            addressId: address.id,
            status: 'PENDING',
            splitFailurePolicy: splitPolicy,
            paymentMethod: paymentMethod as PaymentMethod,
            couponCode,
            subtotalCents: subtotalCentsTotal,
            shippingFeeCents: shippingFeeCentsTotal,
            discountCents,
            totalCents: subtotalCentsTotal + shippingFeeCentsTotal - discountCents,
          },
        });

        const createdOrders: { id: string }[] = [];
        for (const [branchId, group] of groupEntries) {
          const discountForBranch = discountByBranch.get(branchId) ?? 0;
          const shippingQuote = shippingByBranch.get(branchId);
          const deliveryMode =
            group.branch.deliveryMode ??
            group.branch.provider?.deliveryMode ??
            DeliveryMode.PLATFORM;
          const deliveryDistanceKm = shippingQuote?.distanceKm ?? null;
          const deliveryRatePerKmCents = shippingQuote?.ratePerKmCents ?? null;
          const shippingFeeCents = shippingQuote?.fee ?? 0;
          const totalCents = group.subtotalCents + shippingFeeCents - discountForBranch;

          const code = await this.generateOrderCode(tx);
          const order = await tx.order.create({
            data: {
              userId,
              code,
              status: OrderStatus.PENDING,
              paymentMethod: paymentMethod as PaymentMethod,
              subtotalCents: group.subtotalCents,
              shippingFeeCents,
              discountCents: discountForBranch,
              totalCents,
              loyaltyDiscountCents: 0,
              loyaltyPointsUsed: 0,
              addressId: address.id,
              cartId: cart.id,
              notes: payload.note,
              couponCode,
              orderGroupId: orderGroup.id,
              providerId: group.providerId,
              branchId,
              deliveryMode,
              deliveryDistanceKm,
              deliveryRatePerKmCents,
              items: {
                create: group.items.map((item) => ({
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
            select: { id: true },
          });
          createdOrders.push(order);

          for (const item of group.items) {
            const branchProduct = branchProductMap.get(`${branchId}:${item.productId}`);
            let updatedProductStock = false;
            if (branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
              const updated = await tx.branchProduct.updateMany({
                where: {
                  branchId,
                  productId: item.productId,
                  isActive: true,
                  stock: { gte: item.qty },
                },
                data: { stock: { decrement: item.qty } },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ErrorCode.CART_PRODUCT_UNAVAILABLE,
                  `Insufficient stock for ${item.productName}`,
                );
              }
            } else {
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
                  `Insufficient stock for ${item.productName}`,
                );
              }
              updatedProductStock = true;
            }

            const product = productMap.get(item.productId);
            if (product && updatedProductStock) {
              const previousStock = product.stock ?? 0;
              const newStock = previousStock - item.qty;
              await tx.productStockLog.create({
                data: {
                  productId: item.productId,
                  previousStock,
                  newStock,
                  delta: newStock - previousStock,
                  reason: 'order.checkout',
                  actorId: userId,
                },
              });
              product.stock = newStock;
            }
          }

          await this.billing.recordCommissionForOrder(order.id, tx);

          const eventPayload = await this.buildOrderEventPayload(order.id, tx);
          const createdEvent = await this.automation.emit('order.created', eventPayload, {
            tx,
            dedupeKey: `order:${order.id}:${OrderStatus.PENDING}:created`,
          });
          automationEvents.push(createdEvent);
        }

        if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0 && createdOrders.length === 1) {
          const redemption = await this.loyalty.redeemPoints({
            userId,
            pointsToRedeem: payload.loyaltyPointsToRedeem,
            subtotalCents: Math.max(subtotalCentsTotal - discountCents, 0),
            tx,
            orderId: createdOrders[0].id,
          });
          if (redemption.discountCents > 0) {
            await tx.order.update({
              where: { id: createdOrders[0].id },
              data: {
                loyaltyDiscountCents: redemption.discountCents,
                loyaltyPointsUsed: redemption.pointsUsed,
                totalCents: Math.max(subtotalCentsTotal + shippingFeeCentsTotal - discountCents - redemption.discountCents, 0),
              },
            });
            await tx.orderGroup.update({
              where: { id: orderGroup.id },
              data: {
                totalCents: Math.max(subtotalCentsTotal + shippingFeeCentsTotal - discountCents - redemption.discountCents, 0),
              },
            });
          }
        }

        const orderedCartItemIds = filteredItems.map((item) => item.cartItemId);
        if (orderedCartItemIds.length) {
          await tx.cartItem.deleteMany({ where: { id: { in: orderedCartItemIds } } });
        }
        if (cart.couponCode) {
          await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        }

        return {
          orderGroupId: orderGroup.id,
          orderIds: createdOrders.map((order) => order.id),
          skippedBranchIds: Array.from(branchErrors.keys()),
          couponScope,
        };
      });

      await this.automation.enqueueMany(automationEvents);
      for (const orderId of result.orderIds) {
        await this.clearCachesForOrder(orderId, userId);
      }
      this.logger.log({ msg: 'Order created', orderGroupId: result.orderGroupId, userId });
      if (result.orderIds.length === 1) {
        return this.detail(userId, result.orderIds[0]);
      }
      const summary = await this.getOrderGroupSummary(userId, result.orderGroupId);
      return {
        ...summary,
        skippedBranchIds: result.skippedBranchIds,
      };
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingGroup = await this.prisma.orderGroup.findFirst({
          where: { userId, idempotencyKey },
          select: { id: true },
        });
        if (existingGroup) {
          return this.getOrderGroupSummary(userId, existingGroup.id);
        }
      }
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

  private async getOrderGroupSummary(userId: string, orderGroupId: string) {
    const group = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId },
      include: {
        orders: {
          select: {
            id: true,
            code: true,
            status: true,
            totalCents: true,
            subtotalCents: true,
            shippingFeeCents: true,
            discountCents: true,
            providerId: true,
            branchId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order group not found', 404);
    }
    return {
      orderGroupId: group.id,
      code: group.code,
      status: group.status,
      subtotalCents: group.subtotalCents,
      shippingFeeCents: group.shippingFeeCents,
      discountCents: group.discountCents,
      totalCents: group.totalCents,
      createdAt: group.createdAt,
      orders: group.orders.map((order) => ({
        id: order.id,
        code: order.code,
        status: this.toPublicStatus(order.status),
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents,
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        providerId: order.providerId,
        branchId: order.branchId,
        createdAt: order.createdAt,
      })),
    };
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

  private allocateDiscounts(
    totalDiscountCents: number,
    groups: Array<[string, { subtotalCents: number }]>,
  ) {
    const allocations = new Map<string, number>();
    if (totalDiscountCents <= 0 || groups.length === 0) {
      for (const [branchId] of groups) allocations.set(branchId, 0);
      return allocations;
    }
    const totalSubtotal = groups.reduce((sum, [, group]) => sum + group.subtotalCents, 0) || 1;
    let remaining = totalDiscountCents;
    groups.forEach(([branchId, group], index) => {
      if (index === groups.length - 1) {
        allocations.set(branchId, remaining);
        return;
      }
      const share = Math.floor((totalDiscountCents * group.subtotalCents) / totalSubtotal);
      allocations.set(branchId, share);
      remaining -= share;
    });
    return allocations;
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
      const branchId = source.branchId ?? undefined;
      const branchProducts = branchId
        ? await tx.branchProduct.findMany({
            where: { branchId, productId: { in: productIds } },
          })
        : [];
      const branchProductMap = new Map(
        branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
      );

      const orderItems = source.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product unavailable: ${item.productNameSnapshot || item.productId}`,
          );
        }
        const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
        if (branchId && (!branchProduct || !branchProduct.isActive)) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product unavailable: ${item.productNameSnapshot || item.productId}`,
          );
        }
        const availableStock = branchProduct?.stock ?? product.stock ?? 0;
        if (availableStock < item.qty) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Insufficient stock for ${product.name}`,
          );
        }
        const priceCents =
          branchProduct?.salePriceCents ??
          branchProduct?.priceCents ??
          product.salePriceCents ??
          product.priceCents;
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
        const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
        let updatedProductStock = false;
        if (branchId && branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
          await tx.branchProduct.updateMany({
            where: {
              branchId,
              productId: item.productId,
              isActive: true,
              stock: { gte: item.qty },
            },
            data: { stock: { decrement: item.qty } },
          });
        } else {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              status: ProductStatus.ACTIVE,
              deletedAt: null,
              stock: { gte: item.qty },
            },
            data: { stock: { decrement: item.qty } },
          });
          updatedProductStock = true;
        }
        if (updatedProductStock) {
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

      let shippingFeeCents = 0;
      let deliveryDistanceKm: number | null = null;
      let deliveryRatePerKmCents: number | null = null;
      let deliveryMode = source.deliveryMode ?? DeliveryMode.PLATFORM;
      if (branchId && address.lat !== null && address.lat !== undefined && address.lng !== null && address.lng !== undefined) {
        const quote = await this.settings.computeBranchDeliveryQuote({
          branchId,
          addressLat: address.lat,
          addressLng: address.lng,
        });
        shippingFeeCents = quote.shippingFeeCents;
        deliveryDistanceKm = quote.distanceKm;
        deliveryRatePerKmCents = quote.ratePerKmCents;
      } else {
        const quote = await this.settings.computeDeliveryQuote({
          subtotalCents,
          zoneId: address.zoneId,
        });
        shippingFeeCents = quote.shippingFeeCents;
      }

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
          providerId: source.providerId ?? undefined,
          branchId: branchId ?? undefined,
          deliveryMode,
          deliveryDistanceKm,
          deliveryRatePerKmCents,
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

      await this.billing.recordCommissionForOrder(order.id, tx);

      const eventPayload = await this.buildOrderEventPayload(order.id, tx);
      const createdEvent = await this.automation.emit('order.created', eventPayload, {
        tx,
        dedupeKey: `order:${order.id}:${order.status}:reorder`,
      });
      automationEvents.push(createdEvent);

      return { orderId: order.id };
    }).catch(async (error) => {
      await this.rollbackStockForOrderItems(
        source.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          branchId: source.branchId ?? undefined,
        })),
      ).catch(() => undefined);
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
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
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
        await this.restockInventory(orderId, order.items, tx, userId, order.branchId ?? undefined);
        await this.billing.voidCommissionForOrder(orderId, tx);
        await this.refundRedeemedPoints(orderId, tx);
        await this.revokeLoyaltyForOrder(orderId, tx);
        const payload = await this.buildOrderEventPayload(orderId, tx);
        const event = await this.automation.emit('order.canceled', payload, {
          tx,
          dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
        });
        automationEvents.push(event);
        const statusChanged = await this.emitStatusChanged(tx, orderId, order.status, OrderStatus.CANCELED, history.id, userId);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );

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
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
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
        const statusChanged = await this.emitStatusChanged(tx, orderId, before.status, nextStatus, history.id, actorId);
        if (automationEvent) automationEvents.push(automationEvent);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );
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
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
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
        await this.restockInventory(orderId, order.items, tx, actorId, order.branchId ?? undefined);
        await this.billing.voidCommissionForOrder(orderId, tx);
        await this.refundRedeemedPoints(orderId, tx);
        await this.revokeLoyaltyForOrder(orderId, tx);
        const payload = await this.buildOrderEventPayload(orderId, tx);
        const event = await this.automation.emit('order.canceled', payload, {
          tx,
          dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
        });
        automationEvents.push(event);
        const statusChanged = await this.emitStatusChanged(tx, orderId, order.status, OrderStatus.CANCELED, history.id, actorId);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );

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
    branchId?: string,
  ) {
    if (!items?.length) return;
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });
    const stockMap = new Map(products.map((p) => [p.id, p.stock ?? 0]));
    const branchProducts = branchId
      ? await tx.branchProduct.findMany({
          where: { branchId, productId: { in: productIds } },
        })
      : [];
    const branchProductMap = new Map(
      branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
    );
    for (const item of items) {
      const previous = stockMap.get(item.productId) ?? 0;
      const next = previous + item.qty;
      const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
      let updatedProductStock = true;
      if (branchId && branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
        await tx.branchProduct.updateMany({
          where: { branchId, productId: item.productId },
          data: { stock: { increment: item.qty } },
        });
        updatedProductStock = false;
      }
      if (updatedProductStock) {
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
    await this.rollbackStockForOrderItems(
      cart.items.map((i) => ({ productId: i.productId, qty: i.qty, branchId: i.branchId ?? undefined })),
    );
  }

  private async rollbackStockForOrderItems(
    items: { productId: string; qty: number; branchId?: string }[],
  ) {
    if (!items?.length) return;
    for (const item of items) {
      let updatedProductStock = true;
      if (item.branchId) {
        const branchProduct = await this.prisma.branchProduct.findUnique({
          where: { branchId_productId: { branchId: item.branchId, productId: item.productId } },
        });
        if (branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
          await this.prisma.branchProduct.updateMany({
            where: { branchId: item.branchId, productId: item.productId },
            data: { stock: { increment: item.qty } },
          });
          updatedProductStock = false;
        }
      }
      if (updatedProductStock) {
        await this.prisma.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        });
      }
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

  private async emitStatusChanged(
    tx: Prisma.TransactionClient,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    historyId: string,
    actorId?: string,
  ) {
    const payload = await this.buildOrderEventPayload(orderId, tx);
    return this.automation.emit(
      'order.status_changed',
      {
        ...payload,
        from_status: this.toPublicStatus(from),
        to_status: this.toPublicStatus(to),
        from_internal: from,
        to_internal: to,
        actor_id: actorId ?? null,
        history_id: historyId,
        changed_at: new Date().toISOString(),
      },
      { tx, dedupeKey: `order:${orderId}:status_changed:${historyId}` },
    );
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
      customer_phone: order.user?.phone ?? null,
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
      providerId: order.providerId ?? undefined,
      branchId: order.branchId ?? undefined,
      deliveryMode: order.deliveryMode ?? undefined,
      deliveryDistanceKm: order.deliveryDistanceKm ?? undefined,
      deliveryRatePerKmCents: order.deliveryRatePerKmCents ?? undefined,
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
