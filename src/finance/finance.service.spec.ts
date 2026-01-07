import { CommissionDiscountRule, CommissionMode, CommissionScope, FeeRecipient, PaymentMethod } from '@prisma/client';
import { calculateOrderFinancials, FinanceService } from './finance.service';
import { CommissionConfigService } from './commission-config.service';

const baseConfig = {
  id: 'cfg-1',
  scope: CommissionScope.PLATFORM,
  providerId: null,
  categoryId: null,
  mode: CommissionMode.HYBRID,
  commissionRateBps: 200,
  minCommissionCents: 0,
  maxCommissionCents: null,
  deliveryFeeRecipient: FeeRecipient.PLATFORM,
  gatewayFeeRecipient: FeeRecipient.PLATFORM,
  discountRule: CommissionDiscountRule.AFTER_DISCOUNT,
  gatewayFeeRateBps: null,
  gatewayFeeFlatCents: null,
  payoutHoldDays: 0,
  minimumPayoutCents: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

describe('calculateOrderFinancials', () => {
  it('applies commission after discounts', () => {
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 1000,
        discountCents: 1000,
        loyaltyDiscountCents: 0,
        totalCents: 10000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: null, qty: 1, priceCents: 10000 }],
      planRateBps: 200,
      baseConfig,
      categoryOverrides: new Map(),
    });

    expect(result.commissionCents).toBe(180);
    expect(result.vendorNetCents).toBe(8820);
    expect(result.platformRevenueCents).toBe(1180);
  });

  it('skips commission for subscription-only mode', () => {
    const config = { ...baseConfig, mode: CommissionMode.SUBSCRIPTION_ONLY };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 0,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        totalCents: 10000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: null, qty: 1, priceCents: 10000 }],
      planRateBps: 200,
      baseConfig: config,
      categoryOverrides: new Map(),
    });
    expect(result.commissionCents).toBe(0);
  });

  it('uses category override rate when provided', () => {
    const override = { ...baseConfig, commissionRateBps: 500 };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 0,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        totalCents: 10000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: 'cat-1', qty: 1, priceCents: 10000 }],
      planRateBps: 200,
      baseConfig,
      categoryOverrides: new Map([['cat-1', override]]),
    });
    expect(result.commissionCents).toBe(500);
  });

  it('applies min/max commission caps', () => {
    const config = { ...baseConfig, commissionRateBps: 1200, minCommissionCents: 300, maxCommissionCents: 700 };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 0,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        totalCents: 10000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: null, qty: 1, priceCents: 10000 }],
      planRateBps: 0,
      baseConfig: config,
      categoryOverrides: new Map(),
    });
    expect(result.commissionCents).toBe(700);
  });

  it('respects discount rule before discount', () => {
    const config = { ...baseConfig, discountRule: CommissionDiscountRule.BEFORE_DISCOUNT, commissionRateBps: 200 };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 0,
        discountCents: 1000,
        loyaltyDiscountCents: 0,
        totalCents: 9000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: null, qty: 1, priceCents: 10000 }],
      planRateBps: 0,
      baseConfig: config,
      categoryOverrides: new Map(),
    });
    expect(result.commissionCents).toBe(200);
  });

  it('allocates delivery and gateway fees to vendor when configured', () => {
    const config = {
      ...baseConfig,
      commissionRateBps: 200,
      deliveryFeeRecipient: FeeRecipient.VENDOR,
      gatewayFeeRecipient: FeeRecipient.VENDOR,
      gatewayFeeRateBps: 300,
    };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 1000,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        totalCents: 11000,
        paymentMethod: PaymentMethod.CARD,
      },
      items: [{ categoryId: null, qty: 1, priceCents: 10000 }],
      planRateBps: 0,
      baseConfig: config,
      categoryOverrides: new Map(),
    });
    expect(result.gatewayFeeCents).toBe(330);
    expect(result.vendorNetCents).toBe(10470);
    expect(result.platformRevenueCents).toBe(200);
  });

  it('skips commission for category when override is subscription-only', () => {
    const override = { ...baseConfig, mode: CommissionMode.SUBSCRIPTION_ONLY, commissionRateBps: 400 };
    const result = calculateOrderFinancials({
      order: {
        subtotalCents: 10000,
        shippingFeeCents: 0,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        totalCents: 10000,
        paymentMethod: PaymentMethod.COD,
      },
      items: [{ categoryId: 'cat-1', qty: 1, priceCents: 10000 }],
      planRateBps: 200,
      baseConfig,
      categoryOverrides: new Map([['cat-1', override]]),
    });
    expect(result.commissionCents).toBe(0);
  });
});

describe('FinanceService.settleOrder', () => {
  it('writes ledger entry and updates balance', async () => {
    const prisma = {
      orderFinancials: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'fin-1' }) },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          providerId: 'prov-1',
          status: 'DELIVERED',
          subtotalCents: 10000,
          shippingFeeCents: 1000,
          discountCents: 0,
          loyaltyDiscountCents: 0,
          totalCents: 11000,
          paymentMethod: PaymentMethod.COD,
          items: [{ qty: 1, priceSnapshotCents: 10000, product: { categoryId: null } }],
        }),
      },
      providerSubscription: { findFirst: jest.fn().mockResolvedValue({ plan: { currency: 'EGP', commissionRateBps: 200 } }) },
      vendorBalance: { upsert: jest.fn() },
      transactionLedger: { create: jest.fn() },
    } as any;

    const configs = {
      resolveConfigs: jest.fn().mockResolvedValue({ base: baseConfig, categoryOverrides: new Map() }),
      resolveEffectiveBaseConfig: jest.fn().mockReturnValue(baseConfig),
    } as any;

    const service = new FinanceService(prisma, configs as CommissionConfigService);
    await service.settleOrder('order-1');

    expect(prisma.orderFinancials.create).toHaveBeenCalled();
    expect(prisma.transactionLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ORDER_SETTLEMENT', amountCents: 9800 }),
      }),
    );
  });

  it('is idempotent on unique constraint', async () => {
    const prisma = {
      orderFinancials: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'fin-existing' }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          providerId: 'prov-1',
          status: 'DELIVERED',
          subtotalCents: 10000,
          shippingFeeCents: 0,
          discountCents: 0,
          loyaltyDiscountCents: 0,
          totalCents: 10000,
          paymentMethod: PaymentMethod.COD,
          items: [{ qty: 1, priceSnapshotCents: 10000, product: { categoryId: null } }],
        }),
      },
      providerSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
      vendorBalance: { upsert: jest.fn() },
      transactionLedger: { create: jest.fn() },
    } as any;

    const configs = {
      resolveConfigs: jest.fn().mockResolvedValue({ base: baseConfig, categoryOverrides: new Map() }),
      resolveEffectiveBaseConfig: jest.fn().mockReturnValue(baseConfig),
    } as any;

    const service = new FinanceService(prisma, configs as CommissionConfigService);
    const result = await service.settleOrder('order-1');

    expect(result).toEqual({ id: 'fin-existing' });
    expect(prisma.transactionLedger.create).not.toHaveBeenCalled();
  });
});

describe('FinanceService.releaseMaturedHolds', () => {
  it('moves pending balance to available and writes ledger entries', async () => {
    const now = new Date();
    const prisma = {
      orderFinancials: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'fin-1', vendorNetCents: 5000, orderId: 'order-1', currency: 'EGP', holdUntil: now },
        ]),
        updateMany: jest.fn(),
      },
      vendorBalance: { upsert: jest.fn() },
      transactionLedger: { createMany: jest.fn() },
    } as any;

    const service = new FinanceService(prisma, {} as any);
    const result = await service.releaseMaturedHolds('prov-1');

    expect(prisma.vendorBalance.upsert).toHaveBeenCalled();
    expect(prisma.transactionLedger.createMany).toHaveBeenCalled();
    expect(result).toEqual({ releasedCents: 5000, count: 1 });
  });
});
