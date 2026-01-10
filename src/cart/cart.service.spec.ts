import { CartService } from './cart.service';
import { ErrorCode } from '../common/errors';

describe('CartService.add', () => {
  const buildService = () => {
    const prisma = {
      cart: { upsert: jest.fn() },
      product: { findFirst: jest.fn() },
      branch: { findUnique: jest.fn(), findFirst: jest.fn() },
      branchProduct: { findUnique: jest.fn() },
      cartItem: { findUnique: jest.fn(), upsert: jest.fn() },
      address: { findFirst: jest.fn() },
    } as any;
    const settings = {} as any;
    const service = new CartService(prisma, settings);
    return { service, prisma };
  };

  it('blocks adding items from disabled providers', async () => {
    const { service, prisma } = buildService();
    prisma.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1', couponCode: null });
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Item',
      stock: 5,
      priceCents: 1000,
      salePriceCents: null,
      providerId: 'prov-1',
    });
    prisma.branch.findUnique.mockResolvedValue({
      id: 'branch-1',
      providerId: 'prov-1',
      status: 'ACTIVE',
      provider: { status: 'DISABLED' },
    });

    await expect(
      service.add('user-1', { productId: 'prod-1', qty: 1, branchId: 'branch-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.CART_PROVIDER_UNAVAILABLE });
  });

  it('blocks adding out-of-stock items', async () => {
    const { service, prisma } = buildService();
    prisma.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1', couponCode: null });
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Item',
      stock: 10,
      priceCents: 1000,
      salePriceCents: null,
      providerId: 'prov-1',
    });
    prisma.branch.findUnique.mockResolvedValue({
      id: 'branch-1',
      providerId: 'prov-1',
      status: 'ACTIVE',
      provider: { status: 'ACTIVE' },
    });
    prisma.branchProduct.findUnique.mockResolvedValue({
      branchId: 'branch-1',
      productId: 'prod-1',
      isActive: true,
      stock: 0,
      priceCents: 1000,
      salePriceCents: null,
    });

    await expect(
      service.add('user-1', { productId: 'prod-1', qty: 1, branchId: 'branch-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.CART_PRODUCT_OUT_OF_STOCK });
  });
});
