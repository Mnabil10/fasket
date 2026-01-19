import { DeliveryFailureReason, DeliveryMode, OrderStatus } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';
import { OrdersService } from './orders.service';
import { PaymentMethodDto } from './dto';

const buildRealtimeGateway = () => ({
  emitAdminNewOrder: jest.fn(),
  emitProviderNewOrder: jest.fn(),
  emitAdminOrderStatus: jest.fn(),
  emitProviderOrderStatus: jest.fn(),
});

describe('OrdersService.awardLoyaltyForOrder', () => {
  const mockAudit = { log: jest.fn() } as any;
  const mockCache = {} as any;
  const mockAutomation = { emit: jest.fn(), enqueueMany: jest.fn() } as any;
  const mockBilling = { voidCommissionForOrder: jest.fn() } as any;
  const mockFinance = {} as any;

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

    const service = new OrdersService(
      prisma,
      settings,
      loyalty,
      mockAudit,
      mockCache,
      mockAutomation,
      mockBilling,
      mockFinance,
      {} as any,
      buildRealtimeGateway(),
    );
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
      {} as any,
      {} as any,
      buildRealtimeGateway(),
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

describe('OrdersService.create delivery terms', () => {
  const buildService = () => {
    const prisma = {
      orderGroup: { findFirst: jest.fn() },
    } as any;
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );
    return { service, prisma };
  };

  it('rejects orders without delivery terms acceptance', async () => {
    const { service } = buildService();
    await expect(
      service.create('user-1', {
        addressId: 'addr-1',
        paymentMethod: PaymentMethodDto.COD,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.DELIVERY_TERMS_NOT_ACCEPTED });
  });

  it('allows orders when delivery terms are accepted', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(service as any, 'assertPaymentMethodEnabled').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getOrderGroupSummary').mockResolvedValue({ orderGroupId: 'group-1' } as any);
    prisma.orderGroup.findFirst.mockResolvedValue({ id: 'group-1' });

    const result = await service.create('user-1', {
      addressId: 'addr-1',
      paymentMethod: PaymentMethodDto.COD,
      idempotencyKey: 'idempotent-1',
      deliveryTermsAccepted: true,
    });

    expect(result).toEqual({ orderGroupId: 'group-1' });
  });
});

describe('OrdersService.computeGroupTotals', () => {
  const buildService = () => {
    const service = new OrdersService(
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );
    return service;
  };

  it('charges delivery fee once and service fee per provider', () => {
    const service = buildService();
    const totals = (service as any).computeGroupTotals([
      {
        status: OrderStatus.PENDING,
        subtotalCents: 2000,
        shippingFeeCents: 1200,
        serviceFeeCents: 300,
        discountCents: 0,
        totalCents: 3500,
      },
      {
        status: OrderStatus.CONFIRMED,
        subtotalCents: 1500,
        shippingFeeCents: 0,
        serviceFeeCents: 300,
        discountCents: 0,
        totalCents: 1800,
      },
      {
        status: OrderStatus.CANCELED,
        subtotalCents: 500,
        shippingFeeCents: 700,
        serviceFeeCents: 300,
        discountCents: 0,
        totalCents: 1500,
      },
    ]);

    expect(totals).toEqual({
      subtotalCents: 3500,
      shippingFeeCents: 1200,
      serviceFeeCents: 600,
      discountCents: 0,
      totalCents: 5300,
    });
  });
});

describe('OrdersService ordering window', () => {
  const buildService = () =>
    new OrdersService(
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );

  const makeDate = (hours: number, minutes: number) => new Date(2026, 0, 1, hours, minutes, 0, 0);

  it('allows ordering when no window is configured', () => {
    const service = buildService();
    expect(() =>
      (service as any).assertOrderingWindowOpen({ id: 'prov-1' }, makeDate(10, 0)),
    ).not.toThrow();
  });

  it('allows ordering within the configured window', () => {
    const service = buildService();
    expect(() =>
      (service as any).assertOrderingWindowOpen(
        { id: 'prov-1', orderWindowStartMinutes: 480, orderWindowEndMinutes: 1200 },
        makeDate(12, 0),
      ),
    ).not.toThrow();
  });

  it('blocks ordering outside the configured window', () => {
    const service = buildService();
    let thrown: any;
    try {
      (service as any).assertOrderingWindowOpen(
        { id: 'prov-1', orderWindowStartMinutes: 480, orderWindowEndMinutes: 1200 },
        makeDate(6, 0),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toMatchObject({ code: ErrorCode.ORDERING_CLOSED });
  });

  it('supports windows that wrap past midnight', () => {
    const service = buildService();
    expect(() =>
      (service as any).assertOrderingWindowOpen(
        { id: 'prov-1', orderWindowStartMinutes: 1200, orderWindowEndMinutes: 300 },
        makeDate(1, 0),
      ),
    ).not.toThrow();
  });
});

describe('OrdersService.cancelOrderGroup', () => {
  const buildService = () => {
    const prisma = {
      orderGroup: { findFirst: jest.fn(), update: jest.fn() },
    } as any;
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );
    return { service, prisma };
  };

  it('cancels eligible suborders and reports blocked providers', async () => {
    const { service, prisma } = buildService();
    prisma.orderGroup.findFirst
      .mockResolvedValueOnce({
        id: 'group-1',
        orders: [
          {
            id: 'order-1',
            status: OrderStatus.PENDING,
            providerId: 'prov-1',
            provider: { name: 'Provider One' },
          },
          {
            id: 'order-2',
            status: OrderStatus.PREPARING,
            providerId: 'prov-2',
            provider: { name: 'Provider Two' },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'group-1',
        orders: [
          {
            id: 'order-1',
            status: OrderStatus.CANCELED,
            subtotalCents: 0,
            shippingFeeCents: 0,
            serviceFeeCents: 0,
            discountCents: 0,
            totalCents: 0,
          },
          {
            id: 'order-2',
            status: OrderStatus.PREPARING,
            subtotalCents: 1000,
            shippingFeeCents: 0,
            serviceFeeCents: 300,
            discountCents: 0,
            totalCents: 1300,
          },
        ],
      });
    jest.spyOn(service, 'cancelOrder').mockResolvedValue({} as any);

    const result = await service.cancelOrderGroup('user-1', 'group-1');

    expect(service.cancelOrder).toHaveBeenCalledWith('user-1', 'order-1');
    expect(result.cancelledProviders).toEqual([
      { orderId: 'order-1', providerId: 'prov-1', providerName: 'Provider One' },
    ]);
    expect(result.blockedProviders).toEqual([
      { orderId: 'order-2', providerId: 'prov-2', providerName: 'Provider Two', status: 'PREPARING' },
    ]);
  });
});

describe('OrdersService.refreshOrderGroupTotals', () => {
  const buildService = () => {
    const prisma = {
      orderGroup: { findUnique: jest.fn(), update: jest.fn() },
      order: { update: jest.fn() },
    } as any;
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
      { emit: jest.fn(), enqueueMany: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );
    return { service, prisma };
  };

  it('reassigns delivery fee when the primary order is canceled', async () => {
    const { service, prisma } = buildService();
    prisma.orderGroup.findUnique.mockResolvedValue({
      id: 'group-1',
      shippingFeeCents: 1200,
      orders: [
        {
          id: 'order-1',
          status: OrderStatus.CANCELED,
          subtotalCents: 2000,
          shippingFeeCents: 1200,
          serviceFeeCents: 300,
          discountCents: 0,
          totalCents: 3500,
        },
        {
          id: 'order-2',
          status: OrderStatus.CONFIRMED,
          subtotalCents: 1500,
          shippingFeeCents: 0,
          serviceFeeCents: 300,
          discountCents: 0,
          totalCents: 1800,
        },
      ],
    });

    await (service as any).refreshOrderGroupTotals('group-1', prisma);

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-2' },
      data: { shippingFeeCents: 1200, totalCents: 3000 },
    });
    expect(prisma.orderGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        subtotalCents: 1500,
        shippingFeeCents: 1200,
        serviceFeeCents: 300,
        discountCents: 0,
        totalCents: 3000,
      },
    });
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
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      audit,
      cache,
      automation,
      {} as any,
      {} as any,
      {} as any,
      buildRealtimeGateway(),
    );
    jest.spyOn(service as any, 'buildOrderEventPayload').mockResolvedValue({ orderId: 'o1' });
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
    const finance = { settleOrder: jest.fn() } as any;
    const service = new OrdersService(
      prisma,
      {} as any,
      {} as any,
      audit,
      cache,
      automation,
      {} as any,
      finance,
      {} as any,
      buildRealtimeGateway(),
    );
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

  it('stores delivery failure metadata and clears it on retry', async () => {
    const { service, tx } = buildService({
      id: 'o1',
      status: OrderStatus.OUT_FOR_DELIVERY,
      userId: 'u1',
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: 'd1',
    });
    await service.updateStatus('o1', OrderStatus.DELIVERY_FAILED, 'driver-1', 'no response', {
      deliveryFailedReason: DeliveryFailureReason.NO_ANSWER,
      deliveryFailedNote: 'no response',
    });
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: OrderStatus.DELIVERY_FAILED,
          deliveryFailedAt: expect.any(Date),
          deliveryFailedReason: DeliveryFailureReason.NO_ANSWER,
          deliveryFailedNote: 'no response',
        }),
      }),
    );

    const { service: retryService, tx: retryTx } = buildService({
      id: 'o1',
      status: OrderStatus.DELIVERY_FAILED,
      userId: 'u1',
      deliveryMode: DeliveryMode.PLATFORM,
      driverId: 'd1',
    });
    await retryService.updateStatus('o1', OrderStatus.PREPARING, 'admin');
    expect(retryTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: OrderStatus.PREPARING,
          deliveryFailedAt: null,
          deliveryFailedReason: null,
          deliveryFailedNote: null,
        }),
      }),
    );
  });
});
