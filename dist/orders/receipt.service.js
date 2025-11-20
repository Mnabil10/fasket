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
let ReceiptService = class ReceiptService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    async getForCustomer(orderId, userId) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
            include: {
                user: { select: { id: true, name: true, phone: true } },
                address: true,
                driver: { select: { id: true, fullName: true, phone: true } },
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
        });
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found');
        }
        return this.buildReceipt(order);
    }
    async getForAdmin(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { id: true, name: true, phone: true } },
                address: true,
                driver: { select: { id: true, fullName: true, phone: true } },
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
        });
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
        return {
            orderId: order.id,
            createdAt: order.createdAt,
            status: order.status,
            customer: {
                id: order.user?.id ?? order.userId,
                name: order.user?.name ?? '',
                phone: order.user?.phone ?? '',
            },
            address: {
                label: order.address?.label ?? undefined,
                street: order.address?.street ?? undefined,
                city: order.address?.city ?? undefined,
                region: order.address?.notes ?? undefined,
                zoneId: order.deliveryZoneId ?? order.address?.zoneId ?? undefined,
                zoneName: order.deliveryZoneName ?? zone?.nameEn ?? zone?.nameAr ?? undefined,
            },
            driver: order.driver
                ? { id: order.driver.id, fullName: order.driver.fullName, phone: order.driver.phone }
                : undefined,
            items,
            subtotalCents: order.subtotalCents,
            couponDiscountCents: order.discountCents ?? 0,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
            totalCents: order.totalCents,
            loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
            loyaltyPointsUsed: order.loyaltyPointsUsed ?? 0,
            currency: settings.currency,
        };
    }
};
exports.ReceiptService = ReceiptService;
exports.ReceiptService = ReceiptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService])
], ReceiptService);
//# sourceMappingURL=receipt.service.js.map