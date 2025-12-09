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
exports.ReceiptService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
const cache_service_1 = require("../common/cache/cache.service");
let ReceiptService = class ReceiptService {
    constructor(prisma, settings, cache) {
        this.prisma = prisma;
        this.settings = settings;
        this.cache = cache;
    }
    async getForCustomer(orderId, userId) {
        const cacheKey = this.cache.buildKey('orders:receipt', orderId, userId);
        const order = await this.cache.wrap(cacheKey, () => this.prisma.order.findFirst({
            where: { id: orderId, userId },
            include: {
                user: { select: { id: true, name: true, phone: true } },
                address: true,
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        vehicle: { select: { type: true, plateNumber: true } },
                    },
                },
                items: {
                    select: {
                        productId: true,
                        productNameSnapshot: true,
                        priceSnapshotCents: true,
                        qty: true,
                    },
                    orderBy: { id: 'asc' },
                },
            },
        }), Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60));
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found');
        }
        return this.buildReceipt(order);
    }
    async getForAdmin(orderId) {
        const cacheKey = this.cache.buildKey('orders:receipt', orderId);
        const order = await this.cache.wrap(cacheKey, () => this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { id: true, name: true, phone: true } },
                address: true,
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        vehicle: { select: { type: true, plateNumber: true } },
                    },
                },
                items: {
                    select: {
                        productId: true,
                        productNameSnapshot: true,
                        priceSnapshotCents: true,
                        qty: true,
                    },
                    orderBy: { id: 'asc' },
                },
            },
        }), Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60));
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found');
        }
        return this.buildReceipt(order);
    }
    async buildReceipt(order) {
        const settings = await this.settings.getSettings();
        const zone = order.deliveryZoneId &&
            (await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true }));
        const items = order.items.map((item) => ({
            productId: item.productId,
            productName: item.productNameSnapshot,
            quantity: item.qty,
            unitPriceCents: item.priceSnapshotCents,
            lineTotalCents: item.priceSnapshotCents * item.qty,
        }));
        const deliveryZone = zone
            ? {
                id: zone.id,
                name: zone.nameEn || zone.nameAr || order.deliveryZoneName || 'Delivery zone',
                city: zone.city ?? undefined,
                region: zone.region ?? undefined,
                deliveryFeeCents: zone.feeCents,
                freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents ?? null,
                minOrderCents: zone.minOrderAmountCents ?? null,
                etaMinutes: zone.etaMinutes ?? null,
                isActive: zone.isActive,
            }
            : order.deliveryZoneId || order.deliveryZoneName
                ? {
                    id: order.deliveryZoneId ?? 'legacy',
                    name: order.deliveryZoneName ?? 'Delivery',
                    city: order.address?.city ?? undefined,
                    region: undefined,
                    deliveryFeeCents: order.shippingFeeCents ?? 0,
                    freeDeliveryThresholdCents: null,
                    minOrderCents: null,
                    etaMinutes: order.deliveryEtaMinutes ?? null,
                    isActive: true,
                }
                : null;
        const driver = order.driver
            ? {
                id: order.driver.id,
                fullName: order.driver.fullName,
                phone: order.driver.phone,
                vehicleType: order.driver.vehicle?.type,
                plateNumber: order.driver.vehicle?.plateNumber,
            }
            : null;
        return {
            id: order.id,
            code: order.code ?? order.id,
            createdAt: order.createdAt,
            status: order.status,
            customer: {
                id: order.user?.id ?? order.userId,
                name: order.user?.name ?? '',
                phone: order.user?.phone ?? '',
            },
            address: {
                street: order.address?.street ?? undefined,
                city: order.address?.city ?? undefined,
                region: order.address?.region ?? order.address?.notes ?? undefined,
                building: order.address?.building ?? undefined,
                apartment: order.address?.apartment ?? undefined,
                notes: order.address?.notes ?? undefined,
                label: order.address?.label ?? undefined,
            },
            deliveryZone,
            driver,
            items,
            subtotalCents: order.subtotalCents,
            couponDiscountCents: order.couponDiscountCents ?? order.discountCents ?? 0,
            loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            totalCents: order.totalCents,
            loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
            loyaltyPointsRedeemed: order.loyaltyPointsUsed ?? 0,
            currency: settings.currency,
        };
    }
};
exports.ReceiptService = ReceiptService;
exports.ReceiptService = ReceiptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService,
        cache_service_1.CacheService])
], ReceiptService);
//# sourceMappingURL=receipt.service.js.map