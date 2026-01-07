import { OrderStatus } from '@prisma/client';
import { DriverOrdersController } from './driver-orders.controller';

describe('DriverOrdersController', () => {
  const buildController = () => {
    const prisma = {
      deliveryDriver: {
        findFirst: jest.fn().mockResolvedValue({ id: 'driver-1', isActive: true, fullName: 'Driver', phone: '+1' }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
    } as any;
    const orders = { updateStatus: jest.fn().mockResolvedValue({ success: true }) } as any;
    const drivers = { recordLocation: jest.fn() } as any;
    const controller = new DriverOrdersController(prisma, orders, drivers);
    return { controller, prisma, orders };
  };

  it('filters out delivered and canceled orders by default', async () => {
    const { controller, prisma } = buildController();
    await controller.list({ userId: 'user-1' } as any, { page: 1, pageSize: 10 } as any);
    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        driverId: 'driver-1',
        status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELED] },
      }),
    );
  });

  it('starts delivery for an assigned order', async () => {
    const { controller, orders } = buildController();
    await controller.startDelivery({ userId: 'user-1' } as any, 'order-1', { note: 'On my way' });
    expect(orders.updateStatus).toHaveBeenCalledWith('order-1', OrderStatus.OUT_FOR_DELIVERY, 'user-1', 'On my way');
  });

  it('completes delivery for an assigned order', async () => {
    const { controller, orders } = buildController();
    await controller.completeDelivery({ userId: 'user-1' } as any, 'order-1', { note: 'Delivered' });
    expect(orders.updateStatus).toHaveBeenCalledWith('order-1', OrderStatus.DELIVERED, 'user-1', 'Delivered');
  });
});
