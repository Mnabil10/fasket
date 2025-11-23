import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService.awardLoyaltyForOrder', () => {
  const mockNotify = { notify: jest.fn() } as any;
  const mockAudit = { log: jest.fn() } as any;

  const baseConfig = {
    enabled: true,
    earnRate: 1,
    earnPoints: 0,
    earnPerCents: 0,
    redeemRateValue: 0,
    redeemRate: 0,
    redeemUnitCents: 0,
    minRedeemPoints: 0,
    maxDiscountPercent: 0,
    maxRedeemPerOrder: 0,
    resetThreshold: 0,
  };

  const buildService = ({
    order,
    existingTxn,
    awardPointsReturn = 10,
    config = baseConfig,
  }: {
    order?: any;
    existingTxn?: any;
    awardPointsReturn?: number;
    config?: any;
  }) => {
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue(undefined),
      },
      loyaltyTransaction: {
        findFirst: jest.fn().mockResolvedValue(existingTxn),
      },
    } as any;

    const prisma = {
      order: { findMany: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    } as any;

    const settings = {
      getLoyaltyConfig: jest.fn().mockResolvedValue(config),
    } as any;

    const loyalty = {
      awardPoints: jest.fn().mockResolvedValue(awardPointsReturn),
    } as any;

    const service = new OrdersService(prisma, mockNotify, settings, loyalty, mockAudit);
    return { service, prisma, tx, settings, loyalty };
  };

  it('returns 0 when loyalty is disabled', async () => {
    const { service, prisma } = buildService({
      order: { id: 'o1', userId: 'u1', status: OrderStatus.DELIVERED, subtotalCents: 1000, loyaltyPointsEarned: 0 },
      config: { ...baseConfig, enabled: false },
    });
    const result = await service.awardLoyaltyForOrder('o1');
    expect(result).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('awards points once for delivered order', async () => {
    const { service, tx, loyalty } = buildService({
      order: { id: 'o1', userId: 'u1', status: OrderStatus.DELIVERED, subtotalCents: 2500, loyaltyPointsEarned: 0 },
      awardPointsReturn: 25,
    });
    const result = await service.awardLoyaltyForOrder('o1');
    expect(result).toBe(25);
    expect(loyalty.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', subtotalCents: 2500, orderId: 'o1' }),
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { loyaltyPointsEarned: 25 },
    });
  });

  it('is idempotent when an EARN transaction exists', async () => {
    const existingTxn = { id: 'txn1', points: 30 };
    const { service, loyalty, tx } = buildService({
      order: { id: 'o1', userId: 'u1', status: OrderStatus.DELIVERED, subtotalCents: 3000, loyaltyPointsEarned: 0 },
      existingTxn,
    });
    const result = await service.awardLoyaltyForOrder('o1');
    expect(result).toBe(30);
    expect(loyalty.awardPoints).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { loyaltyPointsEarned: 30 },
    });
  });
});
