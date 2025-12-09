import { Injectable } from '@nestjs/common';
import { Address, Cart, Coupon, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { localize } from 'src/common/utils/localize.util';
import { ApplyCouponDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { DomainError, ErrorCode } from '../common/errors';

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

type CartEntity = Cart & { couponCode: string | null };

type CartItemResponse = {
  id: string;
  cartId: string;
  productId: string;
  qty: number;
  priceCents: number;
  product: {
    id: string;
    name: string;
    nameAr?: string | null;
    imageUrl: string | null;
    priceCents: number;
    salePriceCents?: number | null;
  };
};

type CartSnapshot = {
  items: CartItemResponse[];
  subtotalCents: number;
};

type SerializedCoupon = {
  code: string;
  type: Coupon['type'];
  valueCents: number;
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

type CouponNotice = {
  code: 'MIN_TOTAL';
  requiredSubtotalCents: number;
  shortfallCents: number;
};

type CouponValidationResult =
  | { status: 'VALID' }
  | { status: 'INACTIVE' }
  | { status: 'EXPIRED' }
  | { status: 'MIN_TOTAL'; requiredSubtotalCents: number; shortfallCents: number };

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async ensureCart(userId: string): Promise<CartEntity> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return cart as CartEntity;
  }

  async get(userId: string, lang?: Lang, addressId?: string) {
    const cart = await this.ensureCart(userId);
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
  }

  async add(userId: string, dto: { productId: string; qty: number }, lang?: Lang, addressId?: string) {
    if (dto.qty < 1) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Quantity must be at least 1');
    }
    const cart = await this.ensureCart(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: ProductStatus.ACTIVE, deletedAt: null },
    });
    if (!product) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
    }
    if (product.stock < dto.qty) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
    });
    const desiredQty = (existing?.qty ?? 0) + dto.qty;
    if (desiredQty > product.stock) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const price = product.salePriceCents ?? product.priceCents;
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      update: { qty: { increment: dto.qty }, priceCents: price },
      create: { cartId: cart.id, productId: dto.productId, qty: dto.qty, priceCents: price },
    });
    return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
  }

  async updateQty(userId: string, id: string, qty: number, lang?: Lang, addressId?: string) {
    if (qty < 0) qty = 0;
    const cart = await this.ensureCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: { product: true },
    });
    if (!item) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Item not found in cart');
    }
    if (!item.product || item.product.deletedAt || item.product.status !== ProductStatus.ACTIVE) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
    }
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    if (qty === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
    }
    const availableStock = item.product.stock ?? 0;
    if (qty > availableStock) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const price = item.product.salePriceCents ?? item.product.priceCents ?? item.priceCents;
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { qty, priceCents: price },
    });
    return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
  }

  async remove(userId: string, id: string, lang?: Lang, addressId?: string) {
    const cart = await this.ensureCart(userId);
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
    return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
  }

  async applyCoupon(userId: string, dto: ApplyCouponDto, lang?: Lang, addressId?: string) {
    let cart = await this.ensureCart(userId);
    const snapshot = await this.loadCartSnapshot(cart.id, lang);
    if (!snapshot.items.length) {
      throw new DomainError(ErrorCode.CART_EMPTY, 'Cart is empty');
    }
    const coupon = await this.prisma.coupon.findFirst({
      where: { code: dto.couponCode, isActive: true },
    });
    if (!coupon) {
      throw new DomainError(ErrorCode.COUPON_INVALID, 'Invalid coupon code');
    }
    const validation = this.validateCoupon(coupon, snapshot.subtotalCents);
    if (validation.status !== 'VALID' && validation.status !== 'MIN_TOTAL') {
      const message = this.formatCouponValidationMessage(validation.status);
      const code =
        validation.status === 'EXPIRED'
          ? ErrorCode.COUPON_EXPIRED
          : validation.status === 'INACTIVE'
            ? ErrorCode.COUPON_INVALID
            : ErrorCode.COUPON_INVALID;
      throw new DomainError(code, message);
    }
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } });
    cart = { ...cart, couponCode: coupon.code } as CartEntity;
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    return this.buildCartResponse(cart, lang, snapshot, coupon, deliveryAddress);
  }

  private async loadCartSnapshot(cartId: string, lang?: Lang): Promise<CartSnapshot> {
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

    const serializedItems: CartItemResponse[] = await Promise.all(
      validItems.map(async (item) => {
        const product = item.product!;
        const effectivePrice = product.salePriceCents ?? product.priceCents;
        const localizedName = localize(product.name, product.nameAr, lang);
        const imageUrl = (await toPublicImageUrl(product.imageUrl)) ?? null;
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
            imageUrl,
            priceCents: product.priceCents,
            salePriceCents: product.salePriceCents,
          },
        };
      }),
    );

    const subtotalCents = serializedItems.reduce((total, line) => total + line.priceCents * line.qty, 0);
    return { items: serializedItems, subtotalCents };
  }

  private async resolveDeliveryAddress(userId: string, addressId?: string): Promise<Address | null> {
    if (addressId) {
      const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
      if (!address) {
        throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Delivery address not found');
      }
      return address;
    }
    return this.prisma.address.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async buildCartResponse(
    cart: CartEntity,
    lang?: Lang,
    snapshot?: CartSnapshot,
    couponOverride?: Coupon | null,
    deliveryAddress?: Address | null,
  ) {
    const cartSnapshot = snapshot ?? (await this.loadCartSnapshot(cart.id, lang));
    let couponCode = cart.couponCode ?? null;
    if (!cartSnapshot.items.length && couponCode) {
      await this.clearCartCoupon(cart.id);
      couponCode = null;
    }

    const effectiveAddress = deliveryAddress ?? (await this.resolveDeliveryAddress(cart.userId));
    const zone = effectiveAddress?.zoneId
      ? await this.settings.getZoneById(effectiveAddress.zoneId, { includeInactive: false })
      : undefined;
    const minOrderAmountCents = zone?.minOrderAmountCents ?? null;
    const freeDeliveryThresholdCents = zone?.freeDeliveryThresholdCents ?? null;
    const shortfall =
      minOrderAmountCents && cartSnapshot.subtotalCents < minOrderAmountCents
        ? minOrderAmountCents - cartSnapshot.subtotalCents
        : 0;

    const quote = shortfall > 0
      ? {
          shippingFeeCents: zone?.feeCents ?? 0,
          deliveryZoneId: zone?.id,
          deliveryZoneName: zone?.nameEn,
          etaMinutes: zone?.etaMinutes,
          estimatedDeliveryTime: zone?.etaMinutes ? `${zone.etaMinutes} min` : null,
        }
      : await this.settings.computeDeliveryQuote({
          subtotalCents: cartSnapshot.subtotalCents,
          zoneId: effectiveAddress?.zoneId,
        });
    const etaText = this.settings.formatEtaLocalized(quote.etaMinutes ?? zone?.etaMinutes, lang ?? 'en');
    const feeMessages = zone ? this.settings.buildZoneMessages(zone) : undefined;
    const { discountCents, coupon, couponNotice } = await this.resolveCouponDiscount(
      cart.id,
      couponCode,
      cartSnapshot.subtotalCents,
      couponOverride,
    );
    const totalCents = Math.max(cartSnapshot.subtotalCents + quote.shippingFeeCents - discountCents, 0);
    return {
      cartId: cart.id,
      items: cartSnapshot.items,
      subtotalCents: cartSnapshot.subtotalCents,
      shippingFeeCents: quote.shippingFeeCents,
      discountCents,
      totalCents,
      coupon,
      couponNotice,
      delivery: {
        addressId: effectiveAddress?.id ?? null,
        zoneId: quote.deliveryZoneId ?? effectiveAddress?.zoneId ?? null,
        zoneName: quote.deliveryZoneName ?? effectiveAddress?.zoneId ?? null,
        estimatedDeliveryTime: quote.estimatedDeliveryTime ?? null,
        etaMinutes: quote.etaMinutes ?? null,
        minOrderAmountCents,
        minOrderShortfallCents: shortfall > 0 ? shortfall : 0,
        freeDeliveryThresholdCents,
        etaText,
        feeMessageEn: feeMessages?.feeMessageEn,
        feeMessageAr: feeMessages?.feeMessageAr,
      },
    };
  }

  private async resolveCouponDiscount(
    cartId: string,
    couponCode: string | null,
    subtotalCents: number,
    couponOverride?: Coupon | null,
  ) {
    if (!couponCode && !couponOverride) {
      return { discountCents: 0, coupon: null, couponNotice: undefined };
    }
    const coupon =
      couponOverride ??
      (couponCode
        ? await this.prisma.coupon.findFirst({ where: { code: couponCode, isActive: true } })
        : null);
    if (!coupon) {
      if (!couponOverride && couponCode) {
        await this.clearCartCoupon(cartId);
      }
      return { discountCents: 0, coupon: null, couponNotice: undefined };
    }
    const validation = this.validateCoupon(coupon, subtotalCents);
    if (validation.status === 'MIN_TOTAL') {
      return {
        discountCents: 0,
        coupon: this.serializeCoupon(coupon),
        couponNotice: {
          code: 'MIN_TOTAL',
          requiredSubtotalCents: validation.requiredSubtotalCents,
          shortfallCents: Math.max(validation.shortfallCents, 0),
        },
      };
    }
    if (validation.status !== 'VALID') {
      if (!couponOverride && couponCode) {
        await this.clearCartCoupon(cartId);
      }
      return { discountCents: 0, coupon: null, couponNotice: undefined };
    }
    const discountCents = this.calculateCouponDiscount(coupon, subtotalCents);
    return { discountCents, coupon: this.serializeCoupon(coupon), couponNotice: undefined };
  }

  private validateCoupon(coupon: Coupon, subtotalCents: number): CouponValidationResult {
    const now = new Date();
    if (!coupon.isActive || (coupon.startsAt && coupon.startsAt > now)) {
      return { status: 'INACTIVE' };
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      return { status: 'EXPIRED' };
    }
    if (coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
      const shortfall = Math.max(coupon.minOrderCents - subtotalCents, 0);
      return {
        status: 'MIN_TOTAL',
        requiredSubtotalCents: coupon.minOrderCents,
        shortfallCents: shortfall,
      };
    }
    return { status: 'VALID' };
  }

  private calculateCouponDiscount(coupon: Coupon, subtotalCents: number) {
    let discountCents = 0;
    if (coupon.type === 'PERCENT') {
      discountCents = Math.floor((subtotalCents * (coupon.valueCents ?? 0)) / 100);
    } else {
      discountCents = coupon.valueCents ?? 0;
    }
    if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
      discountCents = coupon.maxDiscountCents;
    }
    if (discountCents > subtotalCents) {
      discountCents = subtotalCents;
    }
    return Math.max(0, Math.round(discountCents));
  }

  private formatCouponValidationMessage(status: CouponValidationResult['status']) {
    switch (status) {
      case 'INACTIVE':
        return 'Coupon is not active';
      case 'EXPIRED':
        return 'Coupon has expired';
      default:
        return 'Coupon cannot be applied';
    }
  }

  private serializeCoupon(coupon: Coupon): SerializedCoupon {
    return {
      code: coupon.code,
      type: coupon.type,
      valueCents: coupon.valueCents,
      maxDiscountCents: coupon.maxDiscountCents,
      minOrderCents: coupon.minOrderCents,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
    };
  }

  private async clearCartCoupon(cartId: string) {
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
  }
}
