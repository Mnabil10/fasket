import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { localize } from 'src/common/utils/localize.util';

type CartItemWithProduct = Prisma.CartItemGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        name: true;
        nameAr: true;
        imageUrl: true;
        priceCents: true;
        salePriceCents: true;
        stock: true;
        deletedAt: true;
        status: true;
      };
    };
  };
}>;

type Lang = 'en' | 'ar' | undefined;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  private async ensureCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await this.prisma.cart.create({ data: { userId } });
    }
    return cart;
  }

  async get(userId: string, lang?: Lang) {
    const cart = await this.ensureCart(userId);
    return this.buildCartResponse(cart.id, lang);
  }

  async add(userId: string, dto: { productId: string; qty: number }, lang?: Lang) {
    if (dto.qty < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }
    const cart = await this.ensureCart(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: ProductStatus.ACTIVE, deletedAt: null },
    });
    if (!product) {
      throw new BadRequestException('Product unavailable');
    }
    if (product.stock < dto.qty) {
      throw new BadRequestException('Insufficient stock');
    }
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
    });
    const desiredQty = (existing?.qty ?? 0) + dto.qty;
    if (desiredQty > product.stock) {
      throw new BadRequestException('Insufficient stock');
    }
    const price = product.salePriceCents ?? product.priceCents;
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      update: { qty: { increment: dto.qty }, priceCents: price },
      create: { cartId: cart.id, productId: dto.productId, qty: dto.qty, priceCents: price },
    });
    return this.buildCartResponse(cart.id, lang);
  }

  async updateQty(userId: string, id: string, qty: number, lang?: Lang) {
    if (qty < 0) qty = 0;
    const cart = await this.ensureCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: { product: true },
    });
    if (!item) {
      throw new BadRequestException('Item not found');
    }
    if (!item.product || item.product.deletedAt || item.product.status !== ProductStatus.ACTIVE) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new BadRequestException('Product unavailable');
    }
    if (qty === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      return this.buildCartResponse(cart.id, lang);
    }
    const availableStock = item.product.stock ?? 0;
    if (qty > availableStock) {
      throw new BadRequestException('Insufficient stock');
    }
    const price = item.product.salePriceCents ?? item.product.priceCents ?? item.priceCents;
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { qty, priceCents: price },
    });
    return this.buildCartResponse(cart.id, lang);
  }

  async remove(userId: string, id: string, lang?: Lang) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
    return this.buildCartResponse(cart.id, lang);
  }

  private async buildCartResponse(cartId: string, lang?: Lang) {
    const items: CartItemWithProduct[] = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            imageUrl: true,
            priceCents: true,
            salePriceCents: true,
            stock: true,
            deletedAt: true,
            status: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const orphanIds = items
      .filter(
        (item) =>
          !item.product ||
          item.product.deletedAt ||
          item.product.status !== ProductStatus.ACTIVE,
      )
      .map((item) => item.id);
    if (orphanIds.length) {
      await this.prisma.cartItem.deleteMany({ where: { id: { in: orphanIds } } });
    }
    const validItems = items.filter(
      (item) =>
        item.product &&
        !item.product.deletedAt &&
        item.product.status === ProductStatus.ACTIVE,
    );

    const serializedItems = await Promise.all(
      validItems.map(async (item) => {
        const product = item.product!;
        const effectivePrice = product.salePriceCents ?? product.priceCents;
        const localizedName = localize(product.name, product.nameAr, lang);
        return {
          id: item.id,
          cartId: item.cartId,
          productId: item.productId,
          qty: item.qty,
          priceCents: effectivePrice,
          product: {
            id: product.id,
            name: localizedName,
            nameAr: product.nameAr,
            imageUrl: await toPublicImageUrl(product.imageUrl),
            priceCents: product.priceCents,
            salePriceCents: product.salePriceCents,
          },
        };
      }),
    );

    const subtotalCents = serializedItems.reduce((total, line) => total + line.priceCents * line.qty, 0);
    return { cartId, items: serializedItems, subtotalCents };
  }
}
