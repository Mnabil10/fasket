import { CartService } from './cart.service';
import { ErrorCode } from '../common/errors';

describe('CartService reorder preview', () => {
  const buildService = () => {
    const prisma = {
      order: { findFirst: jest.fn(), create: jest.fn() },
      product: { findMany: jest.fn() },
      productOptionGroup: { findMany: jest.fn() },
      branchProduct: { findMany: jest.fn() },
      cart: { upsert: jest.fn() },
      cartItem: { findFirst: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      address: { findFirst: jest.fn() },
    } as any;
    const settings = {} as any;
    const service = new CartService(prisma, settings);
    return { service, prisma };
  };

  it('returns price changes for available items', async () => {
    const { service, prisma } = buildService();
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      providerId: 'prov-1',
      provider: { id: 'prov-1', status: 'ACTIVE' },
      branchId: null,
      branch: null,
      items: [
        {
          productId: 'prod-1',
          productNameSnapshot: 'Milk',
          priceSnapshotCents: 1000,
          unitPriceCents: 1000,
          qty: 1,
          options: [],
        },
      ],
    });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Milk',
        nameAr: null,
        status: 'ACTIVE',
        deletedAt: null,
        stock: 10,
        priceCents: 1200,
        salePriceCents: null,
        providerId: 'prov-1',
        categoryId: null,
      },
    ]);
    prisma.branchProduct.findMany.mockResolvedValue([]);
    prisma.productOptionGroup.findMany.mockResolvedValue([]);

    const result = await service.getReorderPreview('user-1', 'order-1');
    expect(result.itemsAvailable).toHaveLength(1);
    expect(result.itemsPriceChanged).toHaveLength(1);
    expect(result.itemsMissing).toHaveLength(0);
    expect(result.itemsPriceChanged[0]).toMatchObject({ oldPriceCents: 1000, newPriceCents: 1200 });
  });

  it('marks out-of-stock items as missing', async () => {
    const { service, prisma } = buildService();
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-2',
      userId: 'user-1',
      providerId: 'prov-1',
      provider: { id: 'prov-1', status: 'ACTIVE' },
      branchId: null,
      branch: null,
      items: [
        {
          productId: 'prod-2',
          productNameSnapshot: 'Eggs',
          priceSnapshotCents: 500,
          unitPriceCents: 500,
          qty: 2,
          options: [],
        },
      ],
    });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-2',
        name: 'Eggs',
        nameAr: null,
        status: 'ACTIVE',
        deletedAt: null,
        stock: 0,
        priceCents: 500,
        salePriceCents: null,
        providerId: 'prov-1',
        categoryId: null,
      },
    ]);
    prisma.branchProduct.findMany.mockResolvedValue([]);
    prisma.productOptionGroup.findMany.mockResolvedValue([]);

    const result = await service.getReorderPreview('user-1', 'order-2');
    expect(result.itemsAvailable).toHaveLength(0);
    expect(result.itemsMissing).toHaveLength(1);
    expect(result.itemsMissing[0].reason).toBe('out_of_stock');
  });

  it('marks items missing when provider is disabled', async () => {
    const { service, prisma } = buildService();
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-3',
      userId: 'user-1',
      providerId: 'prov-1',
      provider: { id: 'prov-1', status: 'DISABLED' },
      branchId: null,
      branch: null,
      items: [
        {
          productId: 'prod-3',
          productNameSnapshot: 'Bread',
          priceSnapshotCents: 200,
          unitPriceCents: 200,
          qty: 1,
          options: [],
        },
      ],
    });

    const result = await service.getReorderPreview('user-1', 'order-3');
    expect(result.itemsAvailable).toHaveLength(0);
    expect(result.itemsMissing[0].reason).toBe('provider_unavailable');
  });
});

describe('CartService fillFromOrder', () => {
  it('does not create a new order', async () => {
    const prisma = {
      order: { findFirst: jest.fn(), create: jest.fn() },
      cart: { upsert: jest.fn() },
      cartItem: { findFirst: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      address: { findFirst: jest.fn() },
    } as any;
    const settings = {} as any;
    const service = new CartService(prisma, settings);
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-4',
      userId: 'user-1',
      providerId: 'prov-1',
      provider: { id: 'prov-1', status: 'ACTIVE' },
      branchId: null,
      branch: null,
      items: [
        {
          productId: 'prod-4',
          productNameSnapshot: 'Cheese',
          priceSnapshotCents: 800,
          unitPriceCents: 800,
          qty: 1,
          options: [],
        },
      ],
    });
    prisma.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1', couponCode: null });
    prisma.cartItem.findFirst.mockResolvedValue(null);
    prisma.cartItem.upsert.mockResolvedValue({ id: 'cart-item-1' });
    (service as any).buildReorderPlan = jest.fn().mockResolvedValue({
      vendorId: 'prov-1',
      itemsAvailable: [],
      itemsMissing: [],
      itemsPriceChanged: [],
      suggestedReplacements: [],
      itemsToAdd: [
        {
          productId: 'prod-4',
          branchId: null,
          qty: 1,
          priceCents: 800,
          optionsHash: '',
          optionSelections: [],
          name: 'Cheese',
          originalPriceCents: 800,
        },
      ],
      itemsReplaced: [],
    });
    (service as any).resolveDeliveryAddress = jest.fn().mockResolvedValue(null);
    (service as any).buildCartResponse = jest.fn().mockResolvedValue({ cartId: 'cart-1', items: [] });
    (service as any).syncCartItemOptions = jest.fn().mockResolvedValue(undefined);

    await service.fillFromOrder('user-1', { orderId: 'order-4', strategy: 'SKIP_MISSING' });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('blocks vendor conflict unless cart is cleared', async () => {
    const prisma = {
      order: { findFirst: jest.fn() },
      cart: { upsert: jest.fn() },
      cartItem: { findFirst: jest.fn() },
      address: { findFirst: jest.fn() },
    } as any;
    const settings = {} as any;
    const service = new CartService(prisma, settings);

    prisma.order.findFirst.mockResolvedValue({
      id: 'order-5',
      userId: 'user-1',
      providerId: 'prov-new',
      provider: { id: 'prov-new', status: 'ACTIVE' },
      branchId: null,
      branch: null,
      items: [
        {
          productId: 'prod-5',
          productNameSnapshot: 'Tomato',
          priceSnapshotCents: 100,
          unitPriceCents: 100,
          qty: 1,
          options: [],
        },
      ],
    });
    prisma.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1', couponCode: null });
    prisma.cartItem.findFirst.mockResolvedValue({
      id: 'cart-item-1',
      branchId: 'branch-old',
      branch: { id: 'branch-old', providerId: 'prov-old' },
      product: { providerId: 'prov-old' },
    });

    await expect(
      service.fillFromOrder('user-1', { orderId: 'order-5', strategy: 'SKIP_MISSING' }),
    ).rejects.toMatchObject({ code: ErrorCode.CART_PROVIDER_MISMATCH });
  });
});
