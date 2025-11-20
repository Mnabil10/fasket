"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const image_util_1 = require("../uploads/image.util");
const localize_util_1 = require("../common/utils/localize.util");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
let CartService = class CartService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    async ensureCart(userId) {
        const cart = await this.prisma.cart.upsert({
            where: { userId },
            update: {},
            create: { userId },
        });
        return cart;
    }
    async get(userId, lang, addressId) {
        const cart = await this.ensureCart(userId);
        const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
        return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
    }
    async add(userId, dto, lang, addressId) {
        if (dto.qty < 1) {
            throw new common_1.BadRequestException('Quantity must be at least 1');
        }
        const cart = await this.ensureCart(userId);
        const product = await this.prisma.product.findFirst({
            where: { id: dto.productId, status: client_1.ProductStatus.ACTIVE, deletedAt: null },
        });
        if (!product) {
            throw new common_1.BadRequestException('Product unavailable');
        }
        if (product.stock < dto.qty) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        const existing = await this.prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
        });
        const desiredQty = (existing?.qty ?? 0) + dto.qty;
        if (desiredQty > product.stock) {
            throw new common_1.BadRequestException('Insufficient stock');
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
    async updateQty(userId, id, qty, lang, addressId) {
        if (qty < 0)
            qty = 0;
        const cart = await this.ensureCart(userId);
        const item = await this.prisma.cartItem.findFirst({
            where: { id, cartId: cart.id },
            include: { product: true },
        });
        if (!item) {
            throw new common_1.BadRequestException('Item not found');
        }
        if (!item.product || item.product.deletedAt || item.product.status !== client_1.ProductStatus.ACTIVE) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
            throw new common_1.BadRequestException('Product unavailable');
        }
        const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
        if (qty === 0) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
            return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
        }
        const availableStock = item.product.stock ?? 0;
        if (qty > availableStock) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        const price = item.product.salePriceCents ?? item.product.priceCents ?? item.priceCents;
        await this.prisma.cartItem.update({
            where: { id: item.id },
            data: { qty, priceCents: price },
        });
        return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
    }
    async remove(userId, id, lang, addressId) {
        const cart = await this.ensureCart(userId);
        const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
        await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
        return this.buildCartResponse(cart, lang, undefined, undefined, deliveryAddress);
    }
    async applyCoupon(userId, dto, lang, addressId) {
        let cart = await this.ensureCart(userId);
        const snapshot = await this.loadCartSnapshot(cart.id, lang);
        if (!snapshot.items.length) {
            throw new common_1.BadRequestException('Cart is empty');
        }
        const coupon = await this.prisma.coupon.findFirst({
            where: { code: dto.couponCode, isActive: true },
        });
        if (!coupon) {
            throw new common_1.BadRequestException('Invalid coupon code');
        }
        const validation = this.validateCoupon(coupon, snapshot.subtotalCents);
        if (validation.status !== 'VALID' && validation.status !== 'MIN_TOTAL') {
            throw new common_1.BadRequestException(this.formatCouponValidationMessage(validation.status));
        }
        await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } });
        cart = { ...cart, couponCode: coupon.code };
        const deliveryAddress = await this.resolveDeliveryAddress(userId, addressId);
        return this.buildCartResponse(cart, lang, snapshot, coupon, deliveryAddress);
    }
    async loadCartSnapshot(cartId, lang) {
        const items = await this.prisma.cartItem.findMany({
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
            .filter((item) => !item.product ||
            item.product.deletedAt ||
            item.product.status !== client_1.ProductStatus.ACTIVE)
            .map((item) => item.id);
        if (orphanIds.length) {
            await this.prisma.cartItem.deleteMany({ where: { id: { in: orphanIds } } });
        }
        const validItems = items.filter((item) => item.product &&
            !item.product.deletedAt &&
            item.product.status === client_1.ProductStatus.ACTIVE);
        const serializedItems = await Promise.all(validItems.map(async (item) => {
            const product = item.product;
            const effectivePrice = product.salePriceCents ?? product.priceCents;
            const localizedName = (0, localize_util_1.localize)(product.name, product.nameAr, lang);
            const imageUrl = (await (0, image_util_1.toPublicImageUrl)(product.imageUrl)) ?? null;
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
        }));
        const subtotalCents = serializedItems.reduce((total, line) => total + line.priceCents * line.qty, 0);
        return { items: serializedItems, subtotalCents };
    }
    async resolveDeliveryAddress(userId, addressId) {
        if (addressId) {
            const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
            if (!address) {
                throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_NOT_FOUND, 'Delivery address not found');
            }
            return address;
        }
        return this.prisma.address.findFirst({
            where: { userId },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
    }
    async buildCartResponse(cart, lang, snapshot, couponOverride, deliveryAddress) {
        const cartSnapshot = snapshot ?? (await this.loadCartSnapshot(cart.id, lang));
        let couponCode = cart.couponCode ?? null;
        if (!cartSnapshot.items.length && couponCode) {
            await this.clearCartCoupon(cart.id);
            couponCode = null;
        }
        const effectiveAddress = deliveryAddress ?? (await this.resolveDeliveryAddress(cart.userId));
        const quote = await this.settings.computeDeliveryQuote({
            subtotalCents: cartSnapshot.subtotalCents,
            zoneId: effectiveAddress?.zoneId,
        });
        const { discountCents, coupon, couponNotice } = await this.resolveCouponDiscount(cart.id, couponCode, cartSnapshot.subtotalCents, couponOverride);
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
            },
        };
    }
    async resolveCouponDiscount(cartId, couponCode, subtotalCents, couponOverride) {
        if (!couponCode && !couponOverride) {
            return { discountCents: 0, coupon: null, couponNotice: undefined };
        }
        const coupon = couponOverride ??
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
    validateCoupon(coupon, subtotalCents) {
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
    calculateCouponDiscount(coupon, subtotalCents) {
        let discountCents = 0;
        if (coupon.type === 'PERCENT') {
            discountCents = Math.floor((subtotalCents * (coupon.valueCents ?? 0)) / 100);
        }
        else {
            discountCents = coupon.valueCents ?? 0;
        }
        if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
            discountCents = coupon.maxDiscountCents;
        }
        if (discountCents > subtotalCents) {
            discountCents = subtotalCents;
        }
        return discountCents;
    }
    formatCouponValidationMessage(status) {
        switch (status) {
            case 'INACTIVE':
                return 'Coupon is not active';
            case 'EXPIRED':
                return 'Coupon has expired';
            default:
                return 'Coupon cannot be applied';
        }
    }
    serializeCoupon(coupon) {
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
    async clearCartCoupon(cartId) {
        await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService])
], CartService);
//# sourceMappingURL=cart.service.js.map