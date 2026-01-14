import { Injectable } from '@nestjs/common';
import { Address, Cart, Coupon, Prisma, ProductOptionGroupPriceMode, ProductOptionGroupType, ProductStatus } from '@prisma/client';
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
        providerId: true;
      };
    };
    branch: {
      select: {
        id: true;
        name: true;
        nameAr: true;
        status: true;
        providerId: true;
        provider: {
          select: {
            status: true;
          };
        };
      };
    };
    options: {
      include: {
        option: {
          select: {
            id: true;
            name: true;
            nameAr: true;
            priceCents: true;
            maxQtyPerOption: true;
            isActive: true;
            group: {
              select: {
                id: true;
                name: true;
                nameAr: true;
                type: true;
                priceMode: true;
                minSelected: true;
                maxSelected: true;
                isActive: true;
              };
            };
          };
        };
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
  branchId?: string | null;
  qty: number;
  priceCents: number;
  options: CartItemOptionResponse[];
  product: {
    id: string;
    name: string;
    nameAr?: string | null;
    imageUrl: string | null;
    priceCents: number;
    salePriceCents?: number | null;
  };
};

type CartItemOptionResponse = {
  id: string;
  name: string;
  nameAr?: string | null;
  priceCents: number;
  qty: number;
  groupId: string;
  groupName: string;
  groupNameAr?: string | null;
};

type CartSnapshot = {
  items: CartItemResponse[];
  subtotalCents: number;
};

type CartGroupResponse = {
  branchId: string;
  providerId: string;
  branchName?: string | null;
  branchNameAr?: string | null;
  items: CartItemResponse[];
  subtotalCents: number;
  shippingFeeCents: number;
  distanceKm?: number | null;
  ratePerKmCents?: number | null;
  deliveryMode?: string;
  deliveryRequiresLocation?: boolean;
  deliveryUnavailable?: boolean;
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
  private readonly defaultProviderId = 'prov_default';
  private readonly defaultBranchId = 'branch_default';
  private readonly serviceFeeCents = 300;

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

  async add(
    userId: string,
    dto: { productId: string; qty: number; branchId?: string; options?: { optionId: string; qty?: number }[] },
    lang?: Lang,
    addressId?: string,
  ) {
    if (dto.qty < 1) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Quantity must be at least 1');
    }
    const cart = await this.ensureCart(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: ProductStatus.ACTIVE, deletedAt: null },
      select: { id: true, name: true, stock: true, priceCents: true, salePriceCents: true, providerId: true },
    });
    if (!product) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
    }
    const branch = await this.resolveBranchForProduct(product, dto.branchId);
    if (branch.provider && branch.provider.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.CART_PROVIDER_UNAVAILABLE, 'Provider unavailable');
    }
    const existingScope = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id },
      include: {
        branch: { select: { id: true, providerId: true } },
        product: { select: { providerId: true } },
      },
    });
    if (existingScope) {
      const existingProviderId =
        existingScope.branch?.providerId ??
        existingScope.product?.providerId ??
        this.defaultProviderId;
      const nextProviderId = branch.providerId ?? this.defaultProviderId;
      if (existingProviderId && nextProviderId && existingProviderId !== nextProviderId) {
        throw new DomainError(ErrorCode.CART_PROVIDER_MISMATCH, 'Cart contains items from another provider');
      }
      const existingBranchId = existingScope.branchId ?? existingScope.branch?.id ?? null;
      if (existingBranchId && existingBranchId !== branch.id) {
        throw new DomainError(ErrorCode.CART_BRANCH_MISMATCH, 'Cart contains items from another branch');
      }
    }
    const branchProduct = await this.prisma.branchProduct.findUnique({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
    });
    if (!branchProduct || !branchProduct.isActive) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable in this branch');
    }
    const stock = this.resolveEffectiveStock(product.stock, branchProduct.stock);
    if (stock <= 0) {
      throw new DomainError(ErrorCode.CART_PRODUCT_OUT_OF_STOCK, 'Product out of stock');
    }
    if (stock < dto.qty) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const normalizedOptions = this.normalizeOptionInputs(dto.options);
    const optionSelection = await this.resolveOptionSelections(product.id, normalizedOptions);
    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_branchId_optionsHash: {
          cartId: cart.id,
          productId: dto.productId,
          branchId: branch.id,
          optionsHash: optionSelection.optionsHash,
        },
      },
    });
    const desiredQty = (existing?.qty ?? 0) + dto.qty;
    if (desiredQty > stock) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const basePrice =
      branchProduct.salePriceCents ??
      branchProduct.priceCents ??
      product.salePriceCents ??
      product.priceCents;
    const effectiveBasePrice = optionSelection.basePriceOverrideCents ?? basePrice;
    const price = effectiveBasePrice + optionSelection.optionsTotalCents;
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    const cartItem = await this.prisma.cartItem.upsert({
      where: {
        cartId_productId_branchId_optionsHash: {
          cartId: cart.id,
          productId: dto.productId,
          branchId: branch.id,
          optionsHash: optionSelection.optionsHash,
        },
      },
      update: { qty: { increment: dto.qty }, priceCents: price, optionsHash: optionSelection.optionsHash },
      create: {
        cartId: cart.id,
        productId: dto.productId,
        branchId: branch.id,
        qty: dto.qty,
        priceCents: price,
        optionsHash: optionSelection.optionsHash,
      },
    });
    await this.syncCartItemOptions(cartItem.id, normalizedOptions);
    return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
  }

  async updateQty(
    userId: string,
    id: string,
    qty: number,
    lang?: Lang,
    addressId?: string,
    options?: { optionId: string; qty?: number }[],
  ) {
    if (qty < 0) qty = 0;
    const cart = await this.ensureCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: {
        product: true,
        branch: { include: { provider: { select: { status: true } } } },
        options: true,
      },
    });
    if (!item) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Item not found in cart');
    }
    if (!item.product || item.product.deletedAt || item.product.status !== ProductStatus.ACTIVE) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
    }
    if (!item.branch || item.branch.status !== 'ACTIVE') {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Branch unavailable');
    }
    if (item.branch.provider && item.branch.provider.status !== 'ACTIVE') {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PROVIDER_UNAVAILABLE, 'Provider unavailable');
    }
    const branchProduct = await this.prisma.branchProduct.findUnique({
      where: { branchId_productId: { branchId: item.branch.id, productId: item.product.id } },
    });
    if (!branchProduct || !branchProduct.isActive) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable in this branch');
    }
    const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
    if (qty === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
    }
    const availableStock = this.resolveEffectiveStock(item.product.stock, branchProduct.stock);
    if (availableStock <= 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      throw new DomainError(ErrorCode.CART_PRODUCT_OUT_OF_STOCK, 'Product out of stock');
    }
    const normalizedOptions = this.normalizeOptionInputs(
      options ?? item.options.map((entry) => ({ optionId: entry.optionId, qty: entry.qty })),
    );
    const optionSelection = await this.resolveOptionSelections(item.product.id, normalizedOptions);
    const basePrice =
      branchProduct.salePriceCents ??
      branchProduct.priceCents ??
      item.product.salePriceCents ??
      item.product.priceCents ??
      item.priceCents;
    const effectiveBasePrice = optionSelection.basePriceOverrideCents ?? basePrice;
    const price = effectiveBasePrice + optionSelection.optionsTotalCents;
    if (qty > availableStock) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
    }
    const target = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_branchId_optionsHash: {
          cartId: cart.id,
          productId: item.productId,
          branchId: item.branchId ?? item.branch.id,
          optionsHash: optionSelection.optionsHash,
        },
      },
    });
    if (target && target.id !== item.id) {
      const mergedQty = target.qty + qty;
      if (mergedQty > availableStock) {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for this product');
      }
      await this.prisma.cartItem.update({
        where: { id: target.id },
        data: { qty: mergedQty, priceCents: price, optionsHash: optionSelection.optionsHash },
      });
      await this.syncCartItemOptions(target.id, normalizedOptions);
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { qty, priceCents: price, optionsHash: optionSelection.optionsHash },
      });
      await this.syncCartItemOptions(item.id, normalizedOptions);
    }
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
            providerId: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            status: true,
            providerId: true,
            provider: { select: { status: true } },
          },
        },
        options: {
          include: {
            option: {
              select: {
                id: true,
                name: true,
                nameAr: true,
                priceCents: true,
                maxQtyPerOption: true,
                isActive: true,
                group: {
                  select: {
                    id: true,
                    name: true,
                    nameAr: true,
                    type: true,
                    priceMode: true,
                    minSelected: true,
                    maxSelected: true,
                    isActive: true,
                  },
                },
              },
            },
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
          item.product.status !== ProductStatus.ACTIVE ||
          !item.branch ||
          item.branch.status !== 'ACTIVE' ||
          (item.branch.provider && item.branch.provider.status !== 'ACTIVE'),
      )
      .map((item) => item.id);
    if (orphanIds.length) {
      await this.prisma.cartItem.deleteMany({ where: { id: { in: orphanIds } } });
    }
    const validItems = items.filter(
      (item) =>
        item.product &&
        !item.product.deletedAt &&
        item.product.status === ProductStatus.ACTIVE &&
        item.branch &&
        item.branch.status === 'ACTIVE' &&
        (!item.branch.provider || item.branch.provider.status === 'ACTIVE'),
    );

    const branchPairs = validItems
      .filter((item) => item.branchId)
      .map((item) => ({ branchId: item.branchId!, productId: item.productId }));
    const branchProducts = branchPairs.length
      ? await this.prisma.branchProduct.findMany({
          where: { OR: branchPairs },
        })
      : [];
    const branchProductMap = new Map(
      branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
    );
    const unavailableIds: string[] = [];

    const serializedItems: Array<CartItemResponse | null> = await Promise.all(
      validItems.map(async (item) => {
        const product = item.product!;
        const branchProduct = item.branchId
          ? branchProductMap.get(`${item.branchId}:${item.productId}`)
          : undefined;
        if (!branchProduct || !branchProduct.isActive) {
          unavailableIds.push(item.id);
          return null;
        }
        const optionResponses: CartItemOptionResponse[] = [];
        let optionsTotalCents = 0;
        let baseOverrideCents = 0;
        let hasBaseOverride = false;
        for (const selection of item.options ?? []) {
          const option = selection.option;
          const group = option?.group;
          if (!option || !group || !option.isActive || !group.isActive) {
            unavailableIds.push(item.id);
            return null;
          }
          const optionQty = selection.qty ?? 1;
          if (group.priceMode === ProductOptionGroupPriceMode.SET) {
            baseOverrideCents += option.priceCents * optionQty;
            hasBaseOverride = true;
          } else {
            optionsTotalCents += option.priceCents * optionQty;
          }
          optionResponses.push({
            id: option.id,
            name: localize(option.name, option.nameAr, lang),
            nameAr: option.nameAr ?? null,
            priceCents: option.priceCents,
            qty: optionQty,
            groupId: group.id,
            groupName: localize(group.name, group.nameAr, lang),
            groupNameAr: group.nameAr ?? null,
          });
        }
        optionResponses.sort(
          (a, b) => a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id),
        );
        const effectivePrice =
          branchProduct.salePriceCents ??
          branchProduct.priceCents ??
          product.salePriceCents ??
          product.priceCents;
        const effectiveBasePrice = hasBaseOverride ? baseOverrideCents : effectivePrice;
        const unitPriceCents = effectiveBasePrice + optionsTotalCents;
        const localizedName = localize(product.name, product.nameAr, lang);
        const imageUrl = (await toPublicImageUrl(product.imageUrl)) ?? null;
        return {
          id: item.id,
          cartId: item.cartId,
          productId: item.productId,
          branchId: item.branchId,
          qty: item.qty,
          priceCents: unitPriceCents,
          options: optionResponses,
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

    if (unavailableIds.length) {
      await this.prisma.cartItem.deleteMany({ where: { id: { in: unavailableIds } } });
    }
    const filteredItems = serializedItems.filter((item): item is CartItemResponse => Boolean(item));
    const subtotalCents = filteredItems.reduce((total, line) => total + line.priceCents * line.qty, 0);
    return { items: filteredItems, subtotalCents };
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

  private resolveEffectiveStock(productStock?: number | null, branchStock?: number | null) {
    const productValue = productStock ?? null;
    const branchValue = branchStock ?? null;
    if (productValue === null && branchValue === null) return 0;
    if (productValue === null) return branchValue ?? 0;
    if (branchValue === null) return productValue ?? 0;
    return Math.min(productValue, branchValue);
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
    const groupsByBranch = new Map<string, CartItemResponse[]>();
    for (const item of cartSnapshot.items) {
      const branchId = item.branchId ?? this.defaultBranchId;
      const bucket = groupsByBranch.get(branchId) ?? [];
      bucket.push(item);
      groupsByBranch.set(branchId, bucket);
    }

    const branchIds = Array.from(groupsByBranch.keys());
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: {
            id: true,
            name: true,
            nameAr: true,
            providerId: true,
            deliveryMode: true,
          },
        })
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

    const addressLat = effectiveAddress?.lat ?? null;
    const addressLng = effectiveAddress?.lng ?? null;
    const distancePricingEnabled = this.settings.isDistancePricingEnabled();

    const groupResponses: CartGroupResponse[] = await Promise.all(
      branchIds.map(async (branchId) => {
        const items = groupsByBranch.get(branchId) ?? [];
        const subtotalCents = items.reduce((total, line) => total + line.priceCents * line.qty, 0);
        const branch = branchMap.get(branchId);
        let shippingFeeCents = 0;
        let distanceKm: number | null = null;
        let ratePerKmCents: number | null = null;
        let deliveryRequiresLocation = false;
        let deliveryUnavailable = false;
        const deliveryMode = branch?.deliveryMode ?? undefined;

        const hasLocation = addressLat !== null && addressLng !== null;
        if (!distancePricingEnabled || hasLocation) {
          try {
            const quote = await this.settings.computeBranchDeliveryQuote({
              branchId,
              addressLat: hasLocation ? addressLat : null,
              addressLng: hasLocation ? addressLng : null,
              zoneId: effectiveAddress?.zoneId ?? null,
              subtotalCents,
            });
            shippingFeeCents = quote.shippingFeeCents;
            distanceKm = distancePricingEnabled ? quote.distanceKm : null;
            ratePerKmCents = distancePricingEnabled ? quote.ratePerKmCents : null;
          } catch {
            deliveryUnavailable = true;
            shippingFeeCents = 0;
          }
        } else {
          deliveryRequiresLocation = true;
        }

        return {
          branchId,
          providerId: branch?.providerId ?? this.defaultProviderId,
          branchName: branch?.name ?? null,
          branchNameAr: branch?.nameAr ?? null,
          items,
          subtotalCents,
          shippingFeeCents,
          distanceKm,
          ratePerKmCents,
          deliveryMode,
          deliveryRequiresLocation: distancePricingEnabled ? deliveryRequiresLocation : false,
          deliveryUnavailable,
        };
      }),
    );

    let shippingFeeCents = groupResponses.reduce((sum, group) => sum + group.shippingFeeCents, 0);
    if (groupResponses.length > 1) {
      let maxFee = 0;
      let maxIndex = -1;
      groupResponses.forEach((group, index) => {
        if (group.shippingFeeCents > maxFee) {
          maxFee = group.shippingFeeCents;
          maxIndex = index;
        }
      });
      groupResponses.forEach((group, index) => {
        if (index !== maxIndex) {
          group.shippingFeeCents = 0;
        }
      });
      shippingFeeCents = maxFee;
    }
    const serviceFeeCents = groupResponses.length > 0 ? groupResponses.length * this.serviceFeeCents : 0;
    const { discountCents, coupon, couponNotice } = await this.resolveCouponDiscount(
      cart.id,
      couponCode,
      cartSnapshot.subtotalCents,
      couponOverride,
    );
    const totalCents = Math.max(
      cartSnapshot.subtotalCents + shippingFeeCents + serviceFeeCents - discountCents,
      0,
    );
    return {
      cartId: cart.id,
      items: cartSnapshot.items,
      groups: groupResponses,
      subtotalCents: cartSnapshot.subtotalCents,
      shippingFeeCents,
      serviceFeeCents,
      discountCents,
      totalCents,
      coupon,
      couponNotice,
      delivery: {
        addressId: effectiveAddress?.id ?? null,
        zoneId: effectiveAddress?.zoneId ?? null,
        zoneName: effectiveAddress?.zoneId ?? null,
        estimatedDeliveryTime: null,
        etaMinutes: null,
        minOrderAmountCents: null,
        minOrderShortfallCents: 0,
        freeDeliveryThresholdCents: null,
        etaText: null,
        feeMessageEn: null,
        feeMessageAr: null,
        requiresLocation: distancePricingEnabled && (addressLat === null || addressLng === null),
      },
    };
  }

  private async resolveBranchForProduct(
    product: { id: string; providerId?: string | null },
    branchId?: string,
  ) {
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, providerId: true, status: true, provider: { select: { status: true } } },
      });
      if (!branch || branch.status !== 'ACTIVE') {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Branch unavailable');
      }
      if (branch.provider && branch.provider.status !== 'ACTIVE') {
        throw new DomainError(ErrorCode.CART_PROVIDER_UNAVAILABLE, 'Provider unavailable');
      }
      if (product.providerId && branch.providerId !== product.providerId) {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Branch does not match product provider');
      }
      return branch;
    }

    const providerId = product.providerId ?? this.defaultProviderId;
    const branch =
      (await this.prisma.branch.findFirst({
        where: { providerId, status: 'ACTIVE' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, providerId: true, status: true, provider: { select: { status: true } } },
      })) ??
      (await this.prisma.branch.findUnique({
        where: { id: this.defaultBranchId },
        select: { id: true, providerId: true, status: true, provider: { select: { status: true } } },
      }));

    if (!branch || branch.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Branch unavailable');
    }
    if (branch.provider && branch.provider.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.CART_PROVIDER_UNAVAILABLE, 'Provider unavailable');
    }
    return branch;
  }

  private normalizeOptionInputs(options?: { optionId: string; qty?: number }[]) {
    if (!options || options.length === 0) return [];
    const map = new Map<string, number>();
    for (const entry of options) {
      const optionId = String(entry.optionId ?? '').trim();
      if (!optionId) continue;
      const rawQty = entry.qty ?? 1;
      const qty = Math.floor(Number(rawQty));
      if (!Number.isFinite(qty) || qty < 1) continue;
      map.set(optionId, (map.get(optionId) ?? 0) + qty);
    }
    return Array.from(map.entries())
      .map(([optionId, qty]) => ({ optionId, qty }))
      .sort((a, b) => a.optionId.localeCompare(b.optionId));
  }

  private buildOptionsHash(options: { optionId: string; qty: number }[]) {
    if (!options.length) return '';
    return options.map((entry) => `${entry.optionId}:${entry.qty}`).join('|');
  }

  private async resolveOptionSelections(
    productId: string,
    selections: { optionId: string; qty: number }[],
  ) {
    const groups = await this.prisma.productOptionGroup.findMany({
      where: { productId, isActive: true },
      include: { options: { where: { isActive: true } } },
    });
    if (!groups.length && selections.length > 0) {
      throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Options are not available for this product');
    }

    const optionMap = new Map<
      string,
      {
        option: { id: string; priceCents: number; maxQtyPerOption: number | null };
        group: {
          id: string;
          type: ProductOptionGroupType;
          priceMode: ProductOptionGroupPriceMode;
          minSelected: number;
          maxSelected: number | null;
        };
      }
    >();
    for (const group of groups) {
      for (const option of group.options) {
        optionMap.set(option.id, { option, group });
      }
    }

    const selectedCounts = new Map<string, number>();
    let optionsTotalCents = 0;
    let baseOverrideCents = 0;
    let hasBaseOverride = false;
    for (const selection of selections) {
      const entry = optionMap.get(selection.optionId);
      if (!entry) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Invalid product option selected');
      }
      if (entry.option.maxQtyPerOption && selection.qty > entry.option.maxQtyPerOption) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Option quantity exceeds limit');
      }
      if (entry.group.priceMode === ProductOptionGroupPriceMode.SET) {
        baseOverrideCents += entry.option.priceCents * selection.qty;
        hasBaseOverride = true;
      } else {
        optionsTotalCents += entry.option.priceCents * selection.qty;
      }
      selectedCounts.set(entry.group.id, (selectedCounts.get(entry.group.id) ?? 0) + 1);
    }

    for (const group of groups) {
      const selected = selectedCounts.get(group.id) ?? 0;
      const minSelected = group.minSelected ?? 0;
      const maxSelected =
        group.maxSelected ?? (group.type === ProductOptionGroupType.SINGLE ? 1 : null);
      if (selected < minSelected) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Required options are missing');
      }
      if (maxSelected !== null && maxSelected !== undefined && selected > maxSelected) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Too many options selected');
      }
      if (group.type === ProductOptionGroupType.SINGLE && selected > 1) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Only one option can be selected');
      }
    }

    return {
      optionsTotalCents,
      basePriceOverrideCents: hasBaseOverride ? baseOverrideCents : null,
      optionsHash: this.buildOptionsHash(selections),
    };
  }

  private async syncCartItemOptions(
    cartItemId: string,
    selections: { optionId: string; qty: number }[],
  ) {
    await this.prisma.cartItemOption.deleteMany({ where: { cartItemId } });
    if (!selections.length) return;
    await this.prisma.cartItemOption.createMany({
      data: selections.map((entry) => ({
        cartItemId,
        optionId: entry.optionId,
        qty: entry.qty,
      })),
    });
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
