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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const dto_1 = require("./dto");
const settings_service_1 = require("../settings/settings.service");
const loyalty_service_1 = require("../loyalty/loyalty.service");
const errors_1 = require("../common/errors");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(prisma, notify, settings, loyalty) {
        this.prisma = prisma;
        this.notify = notify;
        this.settings = settings;
        this.loyalty = loyalty;
        this.logger = new common_1.Logger(OrdersService_1.name);
    }
    async list(userId) {
        const orders = await this.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, totalCents: true, status: true, createdAt: true },
        });
        return orders.map((order) => ({
            id: order.id,
            totalCents: order.totalCents,
            status: this.toPublicStatus(order.status),
            createdAt: order.createdAt,
        }));
    }
    async detail(userId, id) {
        const order = await this.prisma.order.findFirst({
            where: { id, userId },
            include: {
                address: true,
                driver: {
                    select: { id: true, fullName: true, phone: true },
                },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        productNameSnapshot: true,
                        priceSnapshotCents: true,
                        qty: true,
                    },
                    orderBy: { id: 'asc' },
                },
            },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return this.toOrderDetail(order);
    }
    async create(userId, payload) {
        const { orderId, loyaltyNotice } = await this.prisma.$transaction(async (tx) => {
            const cart = await tx.cart.findUnique({
                where: { userId },
                include: { items: true },
            });
            if (!cart || cart.items.length === 0) {
                throw new errors_1.DomainError(errors_1.ErrorCode.CART_EMPTY, 'Cart is empty');
            }
            const couponCode = payload.couponCode ?? cart.couponCode ?? undefined;
            const productIds = cart.items.map((item) => item.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, status: client_1.ProductStatus.ACTIVE, deletedAt: null },
                select: { id: true, name: true, stock: true, priceCents: true, salePriceCents: true },
            });
            if (products.length !== productIds.length) {
                throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, 'One or more products are unavailable');
            }
            const productMap = new Map(products.map((product) => [product.id, product]));
            const sourceItems = cart.items.map((item) => {
                const product = productMap.get(item.productId);
                if (!product)
                    throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
                if (product.stock < item.qty) {
                    throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, `Insufficient stock for ${product.name}`);
                }
                return {
                    productId: product.id,
                    productName: product.name,
                    qty: item.qty,
                    priceCents: product.salePriceCents ?? product.priceCents,
                };
            });
            for (const item of sourceItems) {
                const updated = await tx.product.updateMany({
                    where: { id: item.productId, status: client_1.ProductStatus.ACTIVE, stock: { gte: item.qty } },
                    data: { stock: { decrement: item.qty } },
                });
                if (updated.count !== 1) {
                    throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Insufficient stock for ' + item.productId);
                }
                const product = productMap.get(item.productId);
                if (product) {
                    const previousStock = product.stock;
                    const newStock = previousStock - item.qty;
                    product.stock = newStock;
                    await tx.productStockLog.create({
                        data: {
                            productId: product.id,
                            previousStock,
                            newStock,
                            delta: newStock - previousStock,
                            reason: 'order.checkout',
                            actorId: userId,
                        },
                    });
                }
            }
            const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
            if (!address) {
                throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_NOT_FOUND, 'Invalid address');
            }
            const subtotalCents = sourceItems.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
            const quote = await this.settings.computeDeliveryQuote({
                subtotalCents,
                zoneId: address.zoneId,
            });
            const deliveryZone = await this.settings.getZoneById(address.zoneId, { includeInactive: true });
            const shippingFeeCents = quote.shippingFeeCents;
            const deliveryZoneName = deliveryZone?.nameEn ?? deliveryZone?.nameAr ?? address.zoneId;
            const deliveryEtaMinutes = quote.etaMinutes ?? undefined;
            const estimatedDeliveryTime = quote.estimatedDeliveryTime ?? undefined;
            let discountCents = 0;
            if (couponCode) {
                const coupon = await tx.coupon.findFirst({ where: { code: couponCode, isActive: true } });
                const now = new Date();
                const active = coupon &&
                    (!coupon.startsAt || coupon.startsAt <= now) &&
                    (!coupon.endsAt || coupon.endsAt >= now) &&
                    (!coupon.minOrderCents || subtotalCents >= coupon.minOrderCents);
                if (active) {
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
                }
                else {
                    throw new errors_1.DomainError(errors_1.ErrorCode.COUPON_INVALID, 'Coupon is invalid or expired');
                }
            }
            let totalCents = subtotalCents + shippingFeeCents - discountCents;
            const paymentMethod = payload.paymentMethod ?? dto_1.PaymentMethodDto.COD;
            const order = await tx.order.create({
                data: {
                    userId,
                    status: client_1.OrderStatus.PENDING,
                    paymentMethod: paymentMethod,
                    subtotalCents,
                    shippingFeeCents,
                    discountCents,
                    totalCents,
                    loyaltyDiscountCents: 0,
                    loyaltyPointsUsed: 0,
                    addressId: address.id,
                    cartId: cart.id,
                    notes: payload.note,
                    couponCode,
                    deliveryZoneId: address.zoneId,
                    deliveryZoneName,
                    deliveryEtaMinutes,
                    estimatedDeliveryTime,
                    items: {
                        create: sourceItems.map((item) => ({
                            productId: item.productId,
                            productNameSnapshot: item.productName,
                            priceSnapshotCents: item.priceCents,
                            qty: item.qty,
                        })),
                    },
                },
            });
            let loyaltyNotice;
            if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0) {
                const redemption = await this.loyalty.redeemPoints({
                    userId,
                    pointsToRedeem: payload.loyaltyPointsToRedeem,
                    subtotalCents: Math.max(subtotalCents - discountCents, 0),
                    tx,
                    orderId: order.id,
                });
                if (redemption.discountCents > 0) {
                    totalCents = Math.max(totalCents - redemption.discountCents, 0);
                    await tx.order.update({
                        where: { id: order.id },
                        data: {
                            loyaltyDiscountCents: redemption.discountCents,
                            loyaltyPointsUsed: redemption.pointsUsed,
                            totalCents,
                        },
                    });
                    loyaltyNotice = redemption;
                }
            }
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            if (cart.couponCode) {
                await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
            }
            return { orderId: order.id, loyaltyNotice };
        });
        await this.notify.notify('order_created', userId, { orderId, status: client_1.OrderStatus.PENDING });
        if (loyaltyNotice) {
            await this.notify.notify('loyalty_redeemed', userId, {
                orderId,
                points: loyaltyNotice.pointsUsed,
                discountCents: loyaltyNotice.discountCents,
            });
        }
        this.logger.log({ msg: 'Order created', orderId, userId });
        return this.detail(userId, orderId);
    }
    toPublicStatus(status) {
        switch (status) {
            case client_1.OrderStatus.PROCESSING:
                return 'CONFIRMED';
            case client_1.OrderStatus.OUT_FOR_DELIVERY:
                return 'DELIVERING';
            case client_1.OrderStatus.DELIVERED:
                return 'COMPLETED';
            case client_1.OrderStatus.CANCELED:
                return 'CANCELED';
            default:
                return 'PENDING';
        }
    }
    toOrderDetail(order) {
        return {
            id: order.id,
            userId: order.userId,
            status: this.toPublicStatus(order.status),
            paymentMethod: order.paymentMethod,
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents,
            discountCents: order.discountCents,
            loyaltyDiscountCents: order.loyaltyDiscountCents,
            loyaltyPointsUsed: order.loyaltyPointsUsed,
            totalCents: order.totalCents,
            createdAt: order.createdAt,
            note: order.notes ?? undefined,
            estimatedDeliveryTime: order.estimatedDeliveryTime ?? undefined,
            deliveryEtaMinutes: order.deliveryEtaMinutes ?? undefined,
            deliveryZoneId: order.deliveryZoneId ?? undefined,
            deliveryZoneName: order.deliveryZoneName ?? undefined,
            address: order.address
                ? {
                    id: order.address.id,
                    label: order.address.label,
                    city: order.address.city,
                    zoneId: order.address.zoneId,
                    street: order.address.street,
                    building: order.address.building,
                    apartment: order.address.apartment,
                }
                : null,
            driver: order.driver
                ? {
                    id: order.driver.id,
                    fullName: order.driver.fullName,
                    phone: order.driver.phone,
                }
                : null,
            items: order.items.map((item) => ({
                id: item.id,
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                priceSnapshotCents: item.priceSnapshotCents,
                qty: item.qty,
            })),
        };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        settings_service_1.SettingsService,
        loyalty_service_1.LoyaltyService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map