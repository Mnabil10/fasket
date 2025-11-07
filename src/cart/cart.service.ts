import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async ensureCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) cart = await this.prisma.cart.create({ data: { userId } });
    return cart;
  }

  async get(userId: string) {
    const cart = await this.ensureCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: { product: { select: { name: true, imageUrl: true, salePriceCents: true, priceCents: true } } }
    });
    const subtotal = items.reduce((s, i) => s + i.priceCents * i.qty, 0);
    return { cartId: cart.id, items, subtotalCents: subtotal };
  }

  async add(userId: string, dto: { productId: string; qty: number }) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || product.status !== 'ACTIVE' || product.stock < dto.qty) {
      throw new BadRequestException('Product unavailable');
    }
    const cart = await this.ensureCart(userId);
    const price = product.salePriceCents ?? product.priceCents;

    return this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      update: { qty: { increment: dto.qty }, priceCents: price },
      create: { cartId: cart.id, productId: product.id, qty: dto.qty, priceCents: price },
    });
  }

  async updateQty(userId: string, id: string, qty: number) {
    const cart = await this.ensureCart(userId);
    const item = await this.prisma.cartItem.findFirst({ where: { id, cartId: cart.id }, include: { product: true } });
    if (!item) throw new BadRequestException('Item not found');
    if (qty > (item.product?.stock ?? 0)) throw new BadRequestException('Insufficient stock');
    return this.prisma.cartItem.update({ where: { id }, data: { qty } });
  }

  async remove(userId: string, id: string) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
    return { ok: true };
  }
}
