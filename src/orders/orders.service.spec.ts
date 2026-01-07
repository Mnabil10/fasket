import { DeliveryMode, OrderStatus } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';
import { OrdersService } from './orders.service';

describe('OrdersService.awardLoyaltyForOrder', () => {
  const mockAudit = { log: jest.fn() } as any;
  const mockCache = {} as any;
  const mockAutomation = { emit: jest.fn(), enqueueMany: jest.fn() } as any;
  const mockBilling = { voidCommissionForOrder: jest.fn() } as any;

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

    const service = new OrdersService(prisma, settings, loyalty, mockAudit, mockCache, mockAutomation, mockBilling);
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

describe('OrdersService status transitions', () => {
  const buildTransitionService = (order: any) => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
    } as any;
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma };
  };

  it('includes delivery transitions for merchant preparing orders', async () => {
    const { service } = buildTransitionService({
      id: 'o1',
      status: OrderStatus.PREPARING,
      deliveryMode: DeliveryMode.MERCHANT,
      driverId: null,
    });
    const transitions = await service.getOrderTransitions('o1');
    const targets = transitions.map((t) => t.to);
    expect(targets).toEqual(
      expect.arrayContaining([OrderStatus.CANCELED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]),
    );
  });

  it('blocks out-for-delivery without a driver for platform delivery', async () => {
    const { service } = buildTransitionService({
      id: 'o1',
      status: OrderStatus.PREPARING,
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: null,
      userId: 'u1',
    });
    await expect(service.updateStatus('o1', OrderStatus.OUT_FOR_DELIVERY, 'admin')).rejects.toMatchObject({
      code: ErrorCode.ORDER_INVALID_STATUS_TRANSITION,
    });
  });

  it('routes cancel updates to adminCancelOrder', async () => {
    const { service } = buildTransitionService({
      id: 'o1',
      status: OrderStatus.CONFIRMED,
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: null,
      userId: 'u1',
    });
    const cancelSpy = jest.spyOn(service, 'adminCancelOrder').mockResolvedValue({ success: true } as any);
    const result = await service.updateStatus('o1', OrderStatus.CANCELED, 'admin', 'note');
    expect(cancelSpy).toHaveBeenCalledWith('o1', 'admin', 'note');
    expect(result).toEqual({ success: true });
  });

  it('emits preparing automation events with dedupe keys', async () => {
    const { service } = buildTransitionService({
      id: 'o1',
      status: OrderStatus.CONFIRMED,
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: null,
      userId: 'u1',
    });
    const payload = { order_id: 'o1' };
    const buildPayloadSpy = jest.spyOn(service as any, 'buildOrderEventPayload').mockResolvedValue(payload);
    const automation = (service as any).automation;
    automation.emit.mockResolvedValue({ id: 'evt1' });
    const tx = {} as any;
    const result = await service.emitOrderStatusAutomationEvent(
      tx,
      'o1',
      OrderStatus.PREPARING,
      'order:o1:PREPARING:hist1',
    );
    expect(buildPayloadSpy).toHaveBeenCalledWith('o1', tx);
    expect(automation.emit).toHaveBeenCalledWith('order.preparing', payload, {
      tx,
      dedupeKey: 'order:o1:PREPARING:hist1',
    });
    expect(result).toEqual({ id: 'evt1' });
  });
});

describe('OrdersService.assignDriverToOrder', () => {
  const buildService = ({
    order,
    driver,
    updated,
  }: {
    order: any;
    driver: any;
    updated: any;
  }) => {
    const tx = {
      order: {
        update: jest.fn().mockResolvedValue(updated),
      },
    } as any;
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      deliveryDriver: { findUnique: jest.fn().mockResolvedValue(driver) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    } as any;
    const audit = { log: jest.fn() } as any;
    const cache = { buildKey: jest.fn(), del: jest.fn() } as any;
    const automation = { emit: jest.fn().mockResolvedValue({ id: 'evt1' }), enqueueMany: jest.fn() } as any;
    const service = new OrdersService(prisma, {} as any, {} as any, audit, cache, automation, {} as any);
    jest.spyOn(service, 'clearCachesForOrder').mockResolvedValue(undefined);
    return { service, prisma, tx };
  };

  it('assigns an active driver and stores assignedAt', async () => {
    const order = { id: 'o1', userId: 'u1', status: OrderStatus.CONFIRMED, driverId: null };
    const driver = { id: 'd1', fullName: 'Driver One', phone: '+1', isActive: true, vehicle: null };
    const updated = {
      id: 'o1',
      userId: 'u1',
      driverAssignedAt: new Date(),
      driver: { id: driver.id, fullName: driver.fullName, phone: driver.phone, vehicle: null },
    };
    const { service, tx } = buildService({ order, driver, updated });
    await service.assignDriverToOrder('o1', 'd1', 'admin');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          driverId: 'd1',
          driverAssignedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('blocks assignment when status is not eligible', async () => {
    const order = { id: 'o1', userId: 'u1', status: OrderStatus.PENDING, driverId: null };
    const driver = { id: 'd1', fullName: 'Driver One', phone: '+1', isActive: true, vehicle: null };
    const updated = { id: 'o1', userId: 'u1', driverAssignedAt: new Date(), driver: driver };
    const { service } = buildService({ order, driver, updated });
    await expect(service.assignDriverToOrder('o1', 'd1', 'admin')).rejects.toMatchObject({
      code: ErrorCode.ORDER_ASSIGNMENT_NOT_ALLOWED,
    });
  });
});

describe('OrdersService.updateStatus delivery timestamps', () => {
  const buildService = (order: any) => {
    const tx = {
      order: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      orderStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist1' }),
      },
    } as any;
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      allowStatusUpdates: jest.fn((cb: any) => cb()),
      $transaction: jest.fn((cb: any) => cb(tx)),
    } as any;
    const audit = { log: jest.fn() } as any;
    const cache = { buildKey: jest.fn(), del: jest.fn() } as any;
    const automation = { emit: jest.fn(), enqueueMany: jest.fn() } as any;
    const service = new OrdersService(prisma, {} as any, {} as any, audit, cache, automation, {} as any);
    jest.spyOn(service as any, 'emitOrderStatusAutomationEvent').mockResolvedValue(null);
    jest.spyOn(service as any, 'emitStatusChanged').mockResolvedValue(null);
    jest.spyOn(service, 'clearCachesForOrder').mockResolvedValue(undefined);
    jest.spyOn(service, 'awardLoyaltyForOrder').mockResolvedValue(0);
    return { service, tx };
  };

  it('sets outForDeliveryAt when moving to out-for-delivery', async () => {
    const { service, tx } = buildService({
      id: 'o1',
      status: OrderStatus.PREPARING,
      userId: 'u1',
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: 'd1',
    });
    await service.updateStatus('o1', OrderStatus.OUT_FOR_DELIVERY, 'driver-1');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: OrderStatus.OUT_FOR_DELIVERY,
          outForDeliveryAt: expect.any(Date),
        }),
      }),
    );
  });

  it('sets deliveredAt when moving to delivered', async () => {
    const { service, tx } = buildService({
      id: 'o1',
      status: OrderStatus.OUT_FOR_DELIVERY,
      userId: 'u1',
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: 'd1',
    });
    await service.updateStatus('o1', OrderStatus.DELIVERED, 'driver-1');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: OrderStatus.DELIVERED,
          deliveredAt: expect.any(Date),
        }),
      }),
    );
  });
});
