import { Injectable, Logger } from '@nestjs/common';
import {
  CommissionConfig,
  CommissionDiscountRule,
  CommissionMode,
  FeeRecipient,
  LedgerEntryType,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionConfigService } from './commission-config.service';
import { DomainError, ErrorCode } from '../common/errors';

type LineItem = {
  categoryId: string | null;
  qty: number;
  priceCents: number;
};

export type CalculatedFinancials = {
  subtotalCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  loyaltyDiscountCents: number;
  taxCents: number;
  gatewayFeeCents: number;
  commissionRateBps: number;
  commissionCents: number;
  vendorNetCents: number;
  platformRevenueCents: number;
  deliveryFeeRecipient: FeeRecipient;
  gatewayFeeRecipient: FeeRecipient;
  discountRule: CommissionDiscountRule;
  commissionEligibleBaseCents: number;
  categoryRates: Record<string, number>;
  appliedMode: CommissionMode;
};

type SettlementInput = {
  order: {
    subtotalCents: number;
    shippingFeeCents: number;
    serviceFeeCents: number;
    discountCents: number;
    loyaltyDiscountCents: number;
    totalCents: number;
    paymentMethod: PaymentMethod;
  };
  items: LineItem[];
  planRateBps: number;
  baseConfig: CommissionConfig;
  categoryOverrides: Map<string, CommissionConfig>;
};

function resolveRate(planRateBps: number, config: CommissionConfig | null) {
  if (!config) return planRateBps;
  if (typeof config.commissionRateBps === 'number') return config.commissionRateBps;
  return planRateBps;
}

function resolveMode(config: CommissionConfig | null, fallback: CommissionMode) {
  return config?.mode ?? fallback;
}

function allocateDiscounts(lines: LineItem[], totalDiscount: number) {
  if (totalDiscount <= 0 || lines.length === 0) {
    return lines.map(() => 0);
  }
  const total = lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
  if (total <= 0) {
    return lines.map(() => 0);
  }
  let remaining = totalDiscount;
  return lines.map((line, index) => {
    if (index === lines.length - 1) {
      return remaining;
    }
    const raw = Math.floor((totalDiscount * (line.priceCents * line.qty)) / total);
    remaining -= raw;
    return raw;
  });
}

function computeGatewayFee(
  paymentMethod: PaymentMethod,
  totalCents: number,
  config: CommissionConfig,
) {
  if (paymentMethod !== PaymentMethod.CARD) return 0;
  const rate = config.gatewayFeeRateBps ?? 0;
  const flat = config.gatewayFeeFlatCents ?? 0;
  const percentFee = Math.round((totalCents * rate) / 10000);
  return Math.max(0, percentFee + flat);
}

export function calculateOrderFinancials(input: SettlementInput): CalculatedFinancials {
  const { order, items, planRateBps, baseConfig, categoryOverrides } = input;
  const subtotalCents = order.subtotalCents ?? 0;
  const deliveryFeeCents = order.shippingFeeCents ?? 0;
  const serviceFeeCents = order.serviceFeeCents ?? 0;
  const discountCents = order.discountCents ?? 0;
  const loyaltyDiscountCents = order.loyaltyDiscountCents ?? 0;
  const totalDiscount = discountCents + loyaltyDiscountCents;
  const discountRule = baseConfig.discountRule ?? CommissionDiscountRule.AFTER_DISCOUNT;
  const baseMode = baseConfig.mode ?? CommissionMode.HYBRID;
  const baseRate = resolveRate(planRateBps, baseConfig);
  const gatewayFeeCents = computeGatewayFee(order.paymentMethod, order.totalCents ?? 0, baseConfig);

  const lineItems: LineItem[] =
    items.length > 0
      ? items
      : [{ categoryId: null, qty: 1, priceCents: subtotalCents }];
  const discounts = discountRule === CommissionDiscountRule.AFTER_DISCOUNT ? allocateDiscounts(lineItems, totalDiscount) : lineItems.map(() => 0);

  let commissionCents = 0;
  let commissionEligibleBaseCents = 0;
  const categoryRates: Record<string, number> = {};

  lineItems.forEach((line, index) => {
    const lineSubtotal = line.priceCents * line.qty;
    const lineDiscount = discounts[index] ?? 0;
    const lineBase = Math.max(0, lineSubtotal - lineDiscount);
    const override = line.categoryId ? categoryOverrides.get(line.categoryId) ?? null : null;
    const lineMode = resolveMode(override, baseMode);
    const lineRate = resolveRate(baseRate, override ?? baseConfig);
    if (line.categoryId) {
      categoryRates[line.categoryId] = lineRate;
    }
    if (lineMode === CommissionMode.SUBSCRIPTION_ONLY || lineRate <= 0) {
      return;
    }
    commissionEligibleBaseCents += lineBase;
    commissionCents += Math.round((lineBase * lineRate) / 10000);
  });

  if (commissionEligibleBaseCents <= 0) {
    commissionCents = 0;
  } else {
    if (baseConfig.minCommissionCents && commissionCents < baseConfig.minCommissionCents) {
      commissionCents = baseConfig.minCommissionCents;
    }
    if (baseConfig.maxCommissionCents && commissionCents > baseConfig.maxCommissionCents) {
      commissionCents = baseConfig.maxCommissionCents;
    }
    if (commissionCents > commissionEligibleBaseCents) {
      commissionCents = commissionEligibleBaseCents;
    }
  }


  let vendorNetCents = subtotalCents - totalDiscount - commissionCents;
  if (baseConfig.deliveryFeeRecipient === FeeRecipient.VENDOR) {
    vendorNetCents += deliveryFeeCents;
  }
  if (baseConfig.gatewayFeeRecipient === FeeRecipient.VENDOR) {
    vendorNetCents -= gatewayFeeCents;
  }
  if (vendorNetCents < 0) vendorNetCents = 0;

  let platformRevenueCents = commissionCents;
  platformRevenueCents += serviceFeeCents;
  if (baseConfig.deliveryFeeRecipient === FeeRecipient.PLATFORM) {
    platformRevenueCents += deliveryFeeCents;
  }
  if (baseConfig.gatewayFeeRecipient === FeeRecipient.PLATFORM) {
    platformRevenueCents += gatewayFeeCents;
  }

  return {
    subtotalCents,
    deliveryFeeCents,
    serviceFeeCents,
    discountCents,
    loyaltyDiscountCents,
    taxCents: 0,
    gatewayFeeCents,
    commissionRateBps: baseRate,
    commissionCents,
    vendorNetCents,
    platformRevenueCents,
    deliveryFeeRecipient: baseConfig.deliveryFeeRecipient ?? FeeRecipient.PLATFORM,
    gatewayFeeRecipient: baseConfig.gatewayFeeRecipient ?? FeeRecipient.PLATFORM,
    discountRule,
    commissionEligibleBaseCents,
    categoryRates,
    appliedMode: baseMode,
  };
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: CommissionConfigService,
  ) {}

  async settleOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const existing = await client.orderFinancials.findUnique({ where: { orderId } });
    if (existing) return existing;

    const order = await client.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        providerId: true,
        status: true,
        subtotalCents: true,
        shippingFeeCents: true,
        serviceFeeCents: true,
        discountCents: true,
        loyaltyDiscountCents: true,
        totalCents: true,
        paymentMethod: true,
        items: {
          select: {
            qty: true,
            priceSnapshotCents: true,
            product: { select: { categoryId: true } },
          },
        },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Order must be delivered before settlement', 400);
    }
    if (!order.providerId) {
      return null;
    }

    const subscription = await client.providerSubscription.findFirst({
      where: { providerId: order.providerId, status: { in: ['TRIALING', 'ACTIVE'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const planRateBps = subscription?.commissionRateBpsOverride ?? subscription?.plan?.commissionRateBps ?? 0;
    const categoryIds = order.items
      .map((item) => item.product?.categoryId)
      .filter((id): id is string => Boolean(id));
    const { base, categoryOverrides } = await this.configs.resolveConfigs(order.providerId, categoryIds, client);
    const baseConfig = this.configs.resolveEffectiveBaseConfig(base);

    const items: LineItem[] = order.items.map((item) => ({
      categoryId: item.product?.categoryId ?? null,
      qty: item.qty ?? 0,
      priceCents: item.priceSnapshotCents ?? 0,
    }));

    const calculated = calculateOrderFinancials({
      order: {
        subtotalCents: order.subtotalCents ?? 0,
        shippingFeeCents: order.shippingFeeCents ?? 0,
        serviceFeeCents: order.serviceFeeCents ?? 0,
        discountCents: order.discountCents ?? 0,
        loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
        totalCents: order.totalCents ?? 0,
        paymentMethod: order.paymentMethod,
      },
      items,
      planRateBps,
      baseConfig,
      categoryOverrides,
    });

    const holdDays = baseConfig.payoutHoldDays ?? 0;
    const now = new Date();
    const holdUntil = holdDays > 0 ? new Date(now.getTime() + holdDays * 24 * 60 * 60 * 1000) : null;

    try {
      const financials = await client.orderFinancials.create({
        data: {
          orderId: order.id,
          providerId: order.providerId,
          commissionConfigId: baseConfig.id === 'default' ? undefined : baseConfig.id,
          currency: subscription?.plan?.currency ?? 'EGP',
          subtotalCents: calculated.subtotalCents,
          deliveryFeeCents: calculated.deliveryFeeCents,
          serviceFeeCents: calculated.serviceFeeCents,
          discountCents: calculated.discountCents,
          loyaltyDiscountCents: calculated.loyaltyDiscountCents,
          taxCents: calculated.taxCents,
          gatewayFeeCents: calculated.gatewayFeeCents,
          commissionRateBps: calculated.commissionRateBps,
          commissionCents: calculated.commissionCents,
          vendorNetCents: calculated.vendorNetCents,
          platformRevenueCents: calculated.platformRevenueCents,
          deliveryFeeRecipient: calculated.deliveryFeeRecipient,
          gatewayFeeRecipient: calculated.gatewayFeeRecipient,
          discountRule: calculated.discountRule,
          holdUntil: holdUntil ?? undefined,
          settledAt: now,
        },
      });

      await client.vendorBalance.upsert({
        where: { providerId: order.providerId },
        update: {
          availableCents: holdUntil ? undefined : { increment: calculated.vendorNetCents },
          pendingCents: holdUntil ? { increment: calculated.vendorNetCents } : undefined,
          lifetimeSalesCents: { increment: order.totalCents ?? 0 },
          lifetimeCommissionCents: { increment: calculated.commissionCents },
          lifetimeEarningsCents: { increment: calculated.vendorNetCents },
          lastSettlementAt: now,
        },
        create: {
          providerId: order.providerId,
          currency: subscription?.plan?.currency ?? 'EGP',
          availableCents: holdUntil ? 0 : calculated.vendorNetCents,
          pendingCents: holdUntil ? calculated.vendorNetCents : 0,
          lifetimeSalesCents: order.totalCents ?? 0,
          lifetimeCommissionCents: calculated.commissionCents,
          lifetimeEarningsCents: calculated.vendorNetCents,
          lastSettlementAt: now,
        },
      });

      await client.transactionLedger.create({
        data: {
          providerId: order.providerId,
          orderId: order.id,
          type: LedgerEntryType.ORDER_SETTLEMENT,
          amountCents: calculated.vendorNetCents,
          currency: subscription?.plan?.currency ?? 'EGP',
          metadata: {
            commissionRateBps: calculated.commissionRateBps,
            commissionCents: calculated.commissionCents,
            serviceFeeCents: calculated.serviceFeeCents,
            platformRevenueCents: calculated.platformRevenueCents,
            deliveryFeeRecipient: calculated.deliveryFeeRecipient,
            gatewayFeeRecipient: calculated.gatewayFeeRecipient,
            holdUntil: holdUntil?.toISOString() ?? null,
            categoryRates: calculated.categoryRates,
          },
        },
      });

      return financials;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        this.logger.warn({ msg: 'Order financials already settled', orderId });
        return client.orderFinancials.findUnique({ where: { orderId } });
      }
      throw err;
    }
  }

  async releaseMaturedHolds(providerId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const now = new Date();
    const settlements = await client.orderFinancials.findMany({
      where: {
        providerId,
        holdUntil: { lte: now },
        releasedAt: null,
      },
    });
    if (!settlements.length) return { releasedCents: 0, count: 0 };

    const totalRelease = settlements.reduce((sum, entry) => sum + entry.vendorNetCents, 0);
    await client.vendorBalance.upsert({
      where: { providerId },
      update: {
        availableCents: { increment: totalRelease },
        pendingCents: { decrement: totalRelease },
      },
      create: {
        providerId,
        currency: 'EGP',
        availableCents: totalRelease,
        pendingCents: 0,
        lifetimeSalesCents: 0,
        lifetimeCommissionCents: 0,
        lifetimeEarningsCents: 0,
      },
    });

    await client.orderFinancials.updateMany({
      where: { id: { in: settlements.map((entry) => entry.id) } },
      data: { releasedAt: now },
    });

    await client.transactionLedger.createMany({
      data: settlements.map((entry) => ({
        providerId,
        orderId: entry.orderId,
        type: LedgerEntryType.HOLD_RELEASE,
        amountCents: entry.vendorNetCents,
        currency: entry.currency,
        metadata: { holdUntil: entry.holdUntil?.toISOString() ?? null },
      })),
    });

    return { releasedCents: totalRelease, count: settlements.length };
  }

  async getProviderBalance(providerId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const balance = await client.vendorBalance.findUnique({ where: { providerId } });
    if (balance) return balance;
    return client.vendorBalance.create({
      data: {
        providerId,
        currency: 'EGP',
        availableCents: 0,
        pendingCents: 0,
        lifetimeSalesCents: 0,
        lifetimeCommissionCents: 0,
        lifetimeEarningsCents: 0,
      },
    });
  }

  async getProviderDashboard(providerId: string) {
    const [ordersCount, pendingOrdersCount, reviewsSummary, subscription] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { providerId } }),
      this.prisma.order.count({
        where: { providerId, status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING] } },
      }),
      this.prisma.provider.findUnique({
        where: { id: providerId },
        select: { ratingAvg: true, ratingCount: true },
      }),
      this.prisma.providerSubscription.findFirst({
        where: { providerId, status: { in: ['TRIALING', 'ACTIVE'] } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const balance = await this.getProviderBalance(providerId);

    const totalRevenue = await this.prisma.order.aggregate({
      where: { providerId, status: OrderStatus.DELIVERED },
      _sum: { totalCents: true },
    });

    return {
      ordersCount,
      pendingOrdersCount,
      totalRevenueCents: totalRevenue._sum.totalCents ?? 0,
      ratingAvg: reviewsSummary?.ratingAvg ?? 0,
      ratingCount: reviewsSummary?.ratingCount ?? 0,
      subscription,
      balance,
    };
  }

  async getProviderEarnings(providerId: string, range?: { from?: string; to?: string }) {
    const whereFinancials: Prisma.OrderFinancialsWhereInput = { providerId };
    if (range?.from || range?.to) {
      whereFinancials.settledAt = {};
      if (range.from) whereFinancials.settledAt.gte = new Date(range.from);
      if (range.to) whereFinancials.settledAt.lte = new Date(range.to);
    }

    const totals = await this.prisma.orderFinancials.aggregate({
      where: whereFinancials,
      _sum: {
        commissionCents: true,
        vendorNetCents: true,
        platformRevenueCents: true,
      },
    });
    const balance = await this.getProviderBalance(providerId);

    const deliveredOrders = await this.prisma.order.aggregate({
      where: { providerId, status: OrderStatus.DELIVERED },
      _sum: { totalCents: true },
    });

    return {
      balance,
      totals: {
        totalSalesCents: deliveredOrders._sum.totalCents ?? 0,
        totalCommissionCents: totals._sum.commissionCents ?? 0,
        totalNetCents: totals._sum.vendorNetCents ?? 0,
        platformRevenueCents: totals._sum.platformRevenueCents ?? 0,
      },
    };
  }

  async listLedgerEntries(
    providerId: string,
    query: { from?: string; to?: string; type?: LedgerEntryType; skip?: number; take?: number },
  ) {
    const where: Prisma.TransactionLedgerWhereInput = { providerId };
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transactionLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.transactionLedger.count({ where }),
    ]);
    return { items, total };
  }
}
