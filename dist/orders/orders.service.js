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
const audit_log_service_1 = require("../common/audit/audit-log.service");
const cache_service_1 = require("../common/cache/cache.service");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(prisma, notify, settings, loyalty, audit, cache) {
        this.prisma = prisma;
        this.notify = notify;
        this.settings = settings;
        this.loyalty = loyalty;
        this.audit = audit;
        this.cache = cache;
        this.logger = new common_1.Logger(OrdersService_1.name);
        this.listTtl = Number(process.env.ORDER_LIST_CACHE_TTL ?? 30);
        this.receiptTtl = Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60);
    }
    async list(userId) {
        const cacheKey = this.cache.buildKey('orders:list', userId);
        const orders = await this.cache.wrap(cacheKey, () => this.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                code: true,
                totalCents: true,
                status: true,
                createdAt: true,
                loyaltyPointsUsed: true,
                loyaltyDiscountCents: true,
                loyaltyPointsEarned: true,
            },
        }), this.listTtl);
        return orders.map((order) => ({
            id: order.id,
            code: order.code,
            totalCents: order.totalCents,
            status: this.toPublicStatus(order.status),
            createdAt: order.createdAt,
            loyaltyPointsUsed: order.loyaltyPointsUsed ?? 0,
            loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
            loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
        }));
    }
    async detail(userId, id) {
        const cacheKey = this.cache.buildKey('orders:detail', id, userId);
        const order = await this.cache.wrap(cacheKey, () => this.prisma.order.findFirst({
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
        }), this.listTtl);
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
        }
        const zone = order.deliveryZoneId
            ? await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true })
            : undefined;
        return this.toOrderDetail(order, zone);
    }
    async create(userId, payload) {
        const idempotencyKey = payload.idempotencyKey?.trim() || null;
        if (idempotencyKey) {
            const existing = await this.prisma.order.findFirst({
                where: { userId, idempotencyKey },
                select: { id: true },
            });
            if (existing) {
                return this.detail(userId, existing.id);
            }
        }
        try {
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
                    const product = productMap.get(item.productId);
                    if (!product) {
                        throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, 'Product unavailable');
                    }
                    const updated = await tx.product.updateMany({
                        where: {
                            id: item.productId,
                            status: client_1.ProductStatus.ACTIVE,
                            deletedAt: null,
                            stock: { gte: item.qty },
                        },
                        data: { stock: { decrement: item.qty } },
                    });
                    if (updated.count !== 1) {
                        throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, `Insufficient stock for ${product.name || item.productId}`);
                    }
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
                        discountCents = Math.max(0, Math.round(discountCents));
                    }
                    else {
                        throw new errors_1.DomainError(errors_1.ErrorCode.COUPON_EXPIRED, 'Coupon is invalid or expired');
                    }
                }
                let totalCents = subtotalCents + shippingFeeCents - discountCents;
                const paymentMethod = payload.paymentMethod ?? dto_1.PaymentMethodDto.COD;
                const code = await this.generateOrderCode(tx);
                const order = await tx.order.create({
                    data: {
                        userId,
                        code,
                        idempotencyKey,
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
            await this.clearCachesForOrder(orderId, userId);
            return this.detail(userId, orderId);
        }
        catch (error) {
            if (idempotencyKey && error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await this.prisma.order.findFirst({
                    where: { userId, idempotencyKey },
                    select: { id: true },
                });
                if (existing) {
                    return this.detail(userId, existing.id);
                }
            }
            await this.rollbackStockFromCart(userId).catch(() => undefined);
            throw error;
        }
    }
    async awardLoyaltyForOrder(orderId, tx) {
        const config = await this.settings.getLoyaltyConfig();
        if (!config.enabled || config.earnRate <= 0) {
            return 0;
        }
        const runner = async (client) => {
            const order = await client.order.findUnique({
                where: { id: orderId },
                select: { id: true, userId: true, status: true, subtotalCents: true, loyaltyPointsEarned: true },
            });
            if (!order)
                return 0;
            if (order.status !== client_1.OrderStatus.DELIVERED)
                return 0;
            const existingTxn = await client.loyaltyTransaction.findFirst({
                where: { orderId, type: 'EARN' },
            });
            if (existingTxn) {
                if ((order.loyaltyPointsEarned ?? 0) === 0 && existingTxn.points > 0) {
                    await client.order.update({
                        where: { id: orderId },
                        data: { loyaltyPointsEarned: existingTxn.points },
                    });
                }
                return existingTxn.points ?? 0;
            }
            if ((order.loyaltyPointsEarned ?? 0) > 0) {
                return order.loyaltyPointsEarned ?? 0;
            }
            const earned = await this.loyalty.awardPoints({
                userId: order.userId,
                subtotalCents: order.subtotalCents,
                tx: client,
                orderId: order.id,
            });
            if (earned > 0) {
                await client.order.update({
                    where: { id: order.id },
                    data: { loyaltyPointsEarned: earned },
                });
            }
            return earned;
        };
        if (tx) {
            return runner(tx);
        }
        return this.prisma.$transaction(runner);
    }
    async revokeLoyaltyForOrder(orderId, tx) {
        const runner = async (client) => {
            const order = await client.order.findUnique({
                where: { id: orderId },
                select: { id: true, userId: true, loyaltyPointsEarned: true },
            });
            if (!order || !order.loyaltyPointsEarned || order.loyaltyPointsEarned <= 0) {
                return 0;
            }
            const existingAdjustment = await client.loyaltyTransaction.findFirst({
                where: {
                    orderId,
                    type: 'ADJUST',
                    metadata: { path: ['reason'], equals: 'order.cancel' },
                },
            });
            if (existingAdjustment) {
                return Math.abs(existingAdjustment.points ?? 0);
            }
            const user = await client.user.findUnique({
                where: { id: order.userId },
                select: { loyaltyPoints: true },
            });
            if (!user)
                return 0;
            const adjustment = Math.min(order.loyaltyPointsEarned, user.loyaltyPoints);
            const nextBalance = Math.max(0, user.loyaltyPoints - adjustment);
            await client.user.update({
                where: { id: order.userId },
                data: { loyaltyPoints: nextBalance },
            });
            await client.loyaltyTransaction.create({
                data: {
                    userId: order.userId,
                    orderId: order.id,
                    type: 'ADJUST',
                    points: -adjustment,
                    metadata: { reason: 'order.cancel' },
                },
            });
            return adjustment;
        };
        if (tx)
            return runner(tx);
        return this.prisma.$transaction(runner);
    }
    async assignDriverToOrder(orderId, driverId, actorId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, userId: true, status: true, driverId: true },
        });
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
        }
        if (order.status === client_1.OrderStatus.DELIVERED || order.status === client_1.OrderStatus.CANCELED) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
        }
        const driver = await this.prisma.deliveryDriver.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                fullName: true,
                phone: true,
                isActive: true,
                vehicle: { select: { type: true, plateNumber: true } },
            },
        });
        if (!driver) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
        }
        if (!driver.isActive) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_INACTIVE, 'Driver is inactive');
        }
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: { driverId: driver.id, driverAssignedAt: new Date() },
            select: {
                id: true,
                userId: true,
                driverAssignedAt: true,
                driver: {
                    select: { id: true, fullName: true, phone: true, vehicle: { select: { type: true, plateNumber: true } } },
                },
            },
        });
        await this.audit.log({
            action: 'order.assign-driver',
            entity: 'order',
            entityId: orderId,
            actorId,
            before: { driverId: order.driverId ?? null },
            after: { driverId: driver.id },
        });
        await this.notify.notify('order_assigned_driver', updated.userId, {
            orderId: orderId,
            driverId: driver.id,
            driverName: driver.fullName,
            driverPhone: driver.phone,
        });
        await this.clearCachesForOrder(orderId, updated.userId);
        return {
            orderId: updated.id,
            driverAssignedAt: updated.driverAssignedAt,
            driver: {
                id: updated.driver?.id ?? driver.id,
                fullName: updated.driver?.fullName ?? driver.fullName,
                phone: updated.driver?.phone ?? driver.phone,
                vehicleType: updated.driver?.vehicle?.type,
                plateNumber: updated.driver?.vehicle?.plateNumber,
            },
        };
    }
    async clearCachesForOrder(orderId, userId) {
        const keys = [this.cache.buildKey('orders:detail', orderId, userId), this.cache.buildKey('orders:receipt', orderId)];
        if (userId) {
            keys.push(this.cache.buildKey('orders:list', userId));
        }
        await Promise.all(keys.map((key) => this.cache.del(key)));
    }
    async generateOrderCode(tx) {
        let attempts = 0;
        while (attempts < 5) {
            const code = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const exists = await tx.order.findUnique({ where: { code } });
            if (!exists) {
                return code;
            }
            attempts += 1;
        }
        return `ORD-${Date.now().toString(36).toUpperCase()}`;
    }
    async reorder(userId, fromOrderId) {
        const source = await this.prisma.order.findFirst({
            where: { id: fromOrderId, userId },
            include: {
                items: true,
                address: true,
            },
        });
        if (!source) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
        }
        if (!source.items.length) {
            throw new errors_1.DomainError(errors_1.ErrorCode.CART_EMPTY, 'Order has no items to reorder');
        }
        return this.prisma.$transaction(async (tx) => {
            const productIds = Array.from(new Set(source.items.map((i) => i.productId)));
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, status: client_1.ProductStatus.ACTIVE, deletedAt: null },
                select: { id: true, name: true, stock: true, priceCents: true, salePriceCents: true },
            });
            const productMap = new Map(products.map((p) => [p.id, p]));
            const orderItems = source.items.map((item) => {
                const product = productMap.get(item.productId);
                if (!product) {
                    throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, `Product unavailable: ${item.productNameSnapshot || item.productId}`);
                }
                if ((product.stock ?? 0) < item.qty) {
                    throw new errors_1.DomainError(errors_1.ErrorCode.CART_PRODUCT_UNAVAILABLE, `Insufficient stock for ${product.name}`);
                }
                const priceCents = product.salePriceCents ?? product.priceCents;
                return {
                    productId: product.id,
                    productName: product.name,
                    qty: item.qty,
                    priceCents,
                };
            });
            for (const item of orderItems) {
                await tx.product.updateMany({
                    where: {
                        id: item.productId,
                        status: client_1.ProductStatus.ACTIVE,
                        deletedAt: null,
                        stock: { gte: item.qty },
                    },
                    data: { stock: { decrement: item.qty } },
                });
                const product = productMap.get(item.productId);
                const previousStock = product.stock ?? 0;
                const newStock = previousStock - item.qty;
                productMap.set(item.productId, newStock);
                await tx.productStockLog.create({
                    data: {
                        productId: item.productId,
                        previousStock,
                        newStock,
                        delta: newStock - previousStock,
                        reason: 'order.reorder',
                        actorId: userId,
                    },
                });
            }
            const subtotalCents = orderItems.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
            const address = source.address && source.address.userId === userId
                ? source.address
                : await tx.address.findFirst({
                    where: { userId },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
                });
            if (!address) {
                throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_NOT_FOUND, 'No address available for reorder');
            }
            const quote = await this.settings.computeDeliveryQuote({
                subtotalCents,
                zoneId: address.zoneId,
            });
            const deliveryZone = await this.settings.getZoneById(address.zoneId, { includeInactive: true });
            const shippingFeeCents = quote.shippingFeeCents;
            const deliveryZoneName = deliveryZone?.nameEn ?? deliveryZone?.nameAr ?? address.zoneId;
            const totalCents = subtotalCents + shippingFeeCents;
            const code = await this.generateOrderCode(tx);
            const order = await tx.order.create({
                data: {
                    userId,
                    code,
                    status: client_1.OrderStatus.PENDING,
                    paymentMethod: client_1.PaymentMethod.COD,
                    subtotalCents,
                    shippingFeeCents,
                    discountCents: 0,
                    totalCents,
                    loyaltyDiscountCents: 0,
                    loyaltyPointsUsed: 0,
                    addressId: address.id,
                    cartId: null,
                    notes: 'Reorder',
                    couponCode: null,
                    deliveryZoneId: address.zoneId,
                    deliveryZoneName,
                    deliveryEtaMinutes: quote.etaMinutes ?? undefined,
                    estimatedDeliveryTime: quote.estimatedDeliveryTime ?? undefined,
                    items: {
                        create: orderItems.map((item) => ({
                            productId: item.productId,
                            productNameSnapshot: item.productName,
                            priceSnapshotCents: item.priceCents,
                            qty: item.qty,
                        })),
                    },
                },
            });
            await this.notify.notify('order_created', userId, { orderId: order.id, status: client_1.OrderStatus.PENDING });
            await this.clearCachesForOrder(order.id, userId);
            return this.detail(userId, order.id);
        }).catch(async (error) => {
            await this.rollbackStockForOrderItems(source.items).catch(() => undefined);
            throw error;
        });
    }
    async cancelOrder(userId, orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: { select: { productId: true, qty: true, productNameSnapshot: true } },
            },
        });
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
        }
        if (order.userId !== userId) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_UNAUTHORIZED, 'You are not allowed to cancel this order', 403);
        }
        if (order.status === client_1.OrderStatus.DELIVERED) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
        }
        if (order.status === client_1.OrderStatus.CANCELED) {
            await this.clearCachesForOrder(orderId, userId);
            return this.detail(userId, orderId);
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: orderId },
                data: { status: client_1.OrderStatus.CANCELED },
            });
            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    from: order.status,
                    to: client_1.OrderStatus.CANCELED,
                    note: 'Cancelled by customer',
                    actorId: userId,
                },
            });
            await this.restockInventory(orderId, order.items, tx, userId);
            await this.refundRedeemedPoints(orderId, tx);
            await this.revokeLoyaltyForOrder(orderId, tx);
        });
        await this.notify.notify('order_canceled', userId, { orderId });
        await this.clearCachesForOrder(orderId, userId);
        return this.detail(userId, orderId);
    }
    async adminCancelOrder(orderId, actorId, note) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: { select: { productId: true, qty: true, productNameSnapshot: true } } },
        });
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
        }
        if (order.status === client_1.OrderStatus.DELIVERED) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
        }
        if (order.status === client_1.OrderStatus.CANCELED) {
            await this.clearCachesForOrder(orderId, order.userId);
            return { success: true };
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: orderId },
                data: { status: client_1.OrderStatus.CANCELED },
            });
            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    from: order.status,
                    to: client_1.OrderStatus.CANCELED,
                    note: note ?? 'Cancelled by admin',
                    actorId,
                },
            });
            await this.restockInventory(orderId, order.items, tx, actorId);
            await this.refundRedeemedPoints(orderId, tx);
            await this.revokeLoyaltyForOrder(orderId, tx);
        });
        await this.notify.notify('order_canceled', order.userId, { orderId });
        await this.audit.log({
            action: 'order.cancel',
            entity: 'order',
            entityId: orderId,
            actorId,
            before: { status: order.status },
            after: { status: client_1.OrderStatus.CANCELED },
        });
        await this.clearCachesForOrder(orderId, order.userId);
        return { success: true };
    }
    async restockInventory(orderId, items, tx, actorId) {
        if (!items?.length)
            return;
        const productIds = Array.from(new Set(items.map((i) => i.productId)));
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, stock: true },
        });
        const stockMap = new Map(products.map((p) => [p.id, p.stock ?? 0]));
        for (const item of items) {
            const previous = stockMap.get(item.productId) ?? 0;
            const next = previous + item.qty;
            await tx.product.updateMany({
                where: { id: item.productId },
                data: { stock: { increment: item.qty } },
            });
            await tx.productStockLog.create({
                data: {
                    productId: item.productId,
                    previousStock: previous,
                    newStock: next,
                    delta: item.qty,
                    reason: 'order.cancel',
                    actorId,
                },
            });
            stockMap.set(item.productId, next);
        }
    }
    async refundRedeemedPoints(orderId, tx) {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { userId: true, loyaltyPointsUsed: true },
        });
        if (!order || !order.loyaltyPointsUsed || order.loyaltyPointsUsed <= 0) {
            return 0;
        }
        const existing = await tx.loyaltyTransaction.findFirst({
            where: {
                orderId,
                type: 'ADJUST',
                metadata: { path: ['reason'], equals: 'order.cancel.refund' },
            },
        });
        if (existing)
            return existing.points;
        const points = order.loyaltyPointsUsed;
        await tx.user.update({
            where: { id: order.userId },
            data: { loyaltyPoints: { increment: points } },
        });
        await tx.loyaltyTransaction.create({
            data: {
                userId: order.userId,
                orderId,
                type: 'ADJUST',
                points,
                metadata: { reason: 'order.cancel.refund' },
            },
        });
        return points;
    }
    async rollbackStockFromCart(userId) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            include: { items: true },
        });
        if (!cart?.items?.length)
            return;
        await this.rollbackStockForOrderItems(cart.items.map((i) => ({ productId: i.productId, qty: i.qty })));
    }
    async rollbackStockForOrderItems(items) {
        if (!items?.length)
            return;
        for (const item of items) {
            await this.prisma.product.updateMany({
                where: { id: item.productId },
                data: { stock: { increment: item.qty } },
            });
        }
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
    toOrderDetail(order, zone) {
        return {
            id: order.id,
            code: order.code ?? order.id,
            userId: order.userId,
            status: this.toPublicStatus(order.status),
            paymentMethod: order.paymentMethod,
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents,
            discountCents: order.discountCents,
            loyaltyDiscountCents: order.loyaltyDiscountCents,
            loyaltyPointsUsed: order.loyaltyPointsUsed,
            loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
            totalCents: order.totalCents,
            createdAt: order.createdAt,
            note: order.notes ?? undefined,
            estimatedDeliveryTime: order.estimatedDeliveryTime ?? undefined,
            deliveryEtaMinutes: order.deliveryEtaMinutes ?? undefined,
            deliveryZoneId: order.deliveryZoneId ?? undefined,
            deliveryZoneName: order.deliveryZoneName ?? undefined,
            deliveryZone: zone
                ? {
                    id: zone.id,
                    nameEn: zone.nameEn,
                    nameAr: zone.nameAr,
                    city: zone.city,
                    region: zone.region,
                    feeCents: zone.feeCents,
                    etaMinutes: zone.etaMinutes,
                    isActive: zone.isActive,
                    freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
                    minOrderAmountCents: zone.minOrderAmountCents,
                }
                : undefined,
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
            etag: order.updatedAt ? `${order.id}-${order.updatedAt.getTime()}` : order.id,
        };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        settings_service_1.SettingsService,
        loyalty_service_1.LoyaltyService,
        audit_log_service_1.AuditLogService,
        cache_service_1.CacheService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map