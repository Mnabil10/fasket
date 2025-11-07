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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const client_1 = require("@prisma/client");
let OrdersService = class OrdersService {
    constructor(prisma, notify) {
        this.prisma = prisma;
        this.notify = notify;
    }
    list(userId) {
        return this.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, totalCents: true, status: true, createdAt: true }
        });
    }
    detail(userId, id) {
        return this.prisma.order.findFirst({
            where: { id, userId },
            include: { items: true, address: true }
        });
    }
    async create(userId, payload) {
        return this.prisma.$transaction(async (tx) => {
            let sourceItems = [];
            let cartIdToClear = null;
            if (payload.cartId) {
                const cart = await tx.cart.findFirst({ where: { id: payload.cartId, userId }, include: { items: true } });
                if (!cart || cart.items.length === 0)
                    throw new common_1.BadRequestException('Empty cart');
                sourceItems = cart.items.map(i => ({ productId: i.productId, qty: i.qty, priceCents: i.priceCents }));
                cartIdToClear = cart.id;
            }
            else if (payload.items && payload.items.length > 0) {
                const byId = new Map();
                for (const it of payload.items) {
                    byId.set(it.productId, (byId.get(it.productId) ?? 0) + it.qty);
                }
                const products = await tx.product.findMany({ where: { id: { in: Array.from(byId.keys()) } } });
                if (products.length !== byId.size)
                    throw new common_1.BadRequestException('One or more products not found');
                sourceItems = products.map(p => {
                    const qty = byId.get(p.id);
                    if (p.status !== 'ACTIVE' || p.stock < qty)
                        throw new common_1.BadRequestException('Insufficient stock for ' + p.id);
                    return { productId: p.id, qty, priceCents: p.salePriceCents ?? p.priceCents };
                });
            }
            else {
                const cart = await tx.cart.findUnique({ where: { userId }, include: { items: true } });
                if (!cart || cart.items.length === 0)
                    throw new common_1.BadRequestException('Empty cart');
                sourceItems = cart.items.map(i => ({ productId: i.productId, qty: i.qty, priceCents: i.priceCents }));
                cartIdToClear = cart.id;
            }
            for (const it of sourceItems) {
                const res = await tx.product.updateMany({
                    where: { id: it.productId, status: client_1.ProductStatus.ACTIVE, stock: { gte: it.qty } },
                    data: { stock: { decrement: it.qty } },
                });
                if (res.count !== 1)
                    throw new common_1.BadRequestException('Insufficient stock for ' + it.productId);
            }
            const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
            if (!address)
                throw new common_1.BadRequestException('Invalid address');
            const subtotal = sourceItems.reduce((s, i) => s + (i.priceCents ?? 0) * i.qty, 0);
            const setting = await tx.setting.findFirst();
            const baseShipping = setting?.deliveryFeeCents ?? 0;
            const freeMin = setting?.freeDeliveryMinimumCents ?? 0;
            const shipping = freeMin > 0 && subtotal >= freeMin ? 0 : baseShipping;
            let discount = 0;
            if (payload.couponCode) {
                const coupon = await tx.coupon.findFirst({ where: { code: payload.couponCode, isActive: true } });
                const now = new Date();
                const inWindow = coupon && (!coupon.startsAt || coupon.startsAt <= now) && (!coupon.endsAt || coupon.endsAt >= now);
                const meetsMin = coupon && (!coupon.minOrderCents || subtotal >= coupon.minOrderCents);
                if (coupon && inWindow && meetsMin) {
                    if (coupon.type === 'PERCENT') {
                        discount = Math.floor((subtotal * (coupon.valueCents ?? 0)) / 100);
                    }
                    else {
                        discount = Math.min(subtotal, coupon.valueCents ?? 0);
                    }
                    if (coupon.maxDiscountCents && discount > coupon.maxDiscountCents)
                        discount = coupon.maxDiscountCents;
                }
            }
            const total = subtotal + shipping - discount;
            const productIds = sourceItems.map(i => i.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, name: true },
            });
            const nameById = new Map(products.map(p => [p.id, p.name]));
            const order = await tx.order.create({
                data: {
                    userId,
                    status: client_1.OrderStatus.PENDING,
                    paymentMethod: payload.paymentMethod,
                    subtotalCents: subtotal,
                    shippingFeeCents: shipping,
                    discountCents: discount,
                    totalCents: total,
                    addressId: address.id,
                    cartId: cartIdToClear ?? undefined,
                    notes: payload.notes,
                    couponCode: payload.couponCode,
                    items: {
                        create: sourceItems.map(i => ({
                            productId: i.productId,
                            productNameSnapshot: nameById.get(i.productId) ?? '',
                            priceSnapshotCents: i.priceCents ?? 0,
                            qty: i.qty,
                        })),
                    },
                },
            });
            if (cartIdToClear) {
                await tx.cartItem.deleteMany({ where: { cartId: cartIdToClear } });
            }
            await this.notify.enqueueOrderStatusPush(order.id, 'PENDING');
            return order;
        });
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map