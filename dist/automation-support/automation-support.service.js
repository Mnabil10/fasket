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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationSupportService = void 0;
const cache_manager_1 = require("@nestjs/cache-manager");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const automation_events_service_1 = require("../automation/automation-events.service");
const crypto_1 = require("crypto");
let AutomationSupportService = class AutomationSupportService {
    constructor(prisma, settings, automation, cache) {
        this.prisma = prisma;
        this.settings = settings;
        this.automation = automation;
        this.cache = cache;
        this.phoneRegex = /^\+?[1-9]\d{7,14}$/;
        this.rateLimitTtl = 600;
        this.rateLimitPerPhone = 5;
        this.rateLimitPerIp = 20;
    }
    async orderStatusLookup(params) {
        const phone = this.normalizePhone(params.phone);
        await this.bumpOrThrow(`support:status:phone:${phone}`, this.rateLimitPerPhone, this.rateLimitTtl, 'Rate limit exceeded');
        if (params.ip) {
            await this.bumpOrThrow(`support:status:ip:${params.ip}`, this.rateLimitPerIp, this.rateLimitTtl, 'Rate limit exceeded');
        }
        let success = false;
        try {
            const user = await this.prisma.user.findUnique({
                where: { phone },
                select: { id: true, phone: true, name: true },
            });
            if (!user) {
                await this.auditSupport('order-status', phone, false, params.correlationId, params.ip);
                success = true;
                return { orders: [] };
            }
            let orders = [];
            if (params.orderCode) {
                const order = await this.prisma.order.findFirst({
                    where: { code: params.orderCode, userId: user.id },
                    include: {
                        items: { select: { productNameSnapshot: true, qty: true } },
                        driver: { select: { fullName: true, phone: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                });
                orders = order ? [order] : [];
            }
            else {
                const list = await this.prisma.order.findMany({
                    where: { userId: user.id },
                    include: {
                        items: { select: { productNameSnapshot: true, qty: true } },
                        driver: { select: { fullName: true, phone: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                });
                if (params.last4) {
                    orders = list.filter((o) => (o.code || o.id).endsWith(params.last4)).slice(0, 2);
                }
                else {
                    orders = list.slice(0, 2);
                }
            }
            const mapped = orders.map((order) => ({
                orderCode: order.code ?? order.id,
                status: this.toPublicStatus(order.status),
                etaMinutes: order.deliveryEtaMinutes ?? null,
                itemsSummary: (order.items || []).map((i) => `${i.productNameSnapshot} x${i.qty}`).join(', '),
                totalFormatted: (order.totalCents / 100).toFixed(2),
                createdAt: order.createdAt,
                driver: order.driver
                    ? {
                        name: order.driver.fullName,
                        phoneMasked: this.maskPhone(order.driver.phone),
                    }
                    : null,
            }));
            success = true;
            await this.auditSupport('order-status', phone, true, params.correlationId, params.ip, orders[0]?.code ?? orders[0]?.id, mapped.map((m) => `${m.orderCode}:${m.status}`).join('; ').slice(0, 240));
            await this.automation.emit('support.order_status.requested', { phone, orderCode: params.orderCode ?? null, results: mapped.length }, { dedupeKey: `support:status:${phone}:${params.orderCode ?? 'latest'}` });
            return { orders: mapped };
        }
        finally {
            if (!success) {
                await this.auditSupport('order-status', this.normalizePhoneSafe(params.phone), false, params.correlationId, params.ip, params.orderCode);
            }
        }
    }
    async productSearch(q, ip) {
        const query = (q || '').trim();
        if (!query)
            throw new common_1.BadRequestException('q is required');
        await this.bumpOrThrow(`support:product:ip:${ip ?? 'unknown'}`, 30, this.rateLimitTtl, 'Rate limit exceeded');
        const products = await this.prisma.product.findMany({
            where: {
                deletedAt: null,
                status: 'ACTIVE',
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { nameAr: { contains: query, mode: 'insensitive' } },
                    { slug: { contains: query, mode: 'insensitive' } },
                ],
            },
            orderBy: { updatedAt: 'desc' },
            take: 3,
            select: { id: true, sku: true, name: true, nameAr: true, priceCents: true, salePriceCents: true, stock: true },
        });
        return {
            items: products.map((p) => ({
                id: p.id,
                sku: p.sku,
                name: p.nameAr || p.name,
                priceCents: p.salePriceCents ?? p.priceCents,
                available: (p.stock ?? 0) > 0,
            })),
        };
    }
    async deliveryZones() {
        const zones = await this.settings.getActiveDeliveryZones();
        return zones.map((z) => ({ id: z.id, name: z.nameEn ?? z.nameAr ?? z.id }));
    }
    normalizePhone(phone) {
        const trimmed = (phone || '').trim();
        if (!this.phoneRegex.test(trimmed)) {
            throw new common_1.BadRequestException('Invalid phone');
        }
        return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    }
    normalizePhoneSafe(phone) {
        if (!phone)
            return '';
        return phone.startsWith('+') ? phone : `+${phone}`;
    }
    maskPhone(phone) {
        if (!phone)
            return '';
        if (phone.length <= 6)
            return '***';
        return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
    }
    toPublicStatus(status) {
        switch (status) {
            case 'PROCESSING':
                return 'CONFIRMED';
            case 'OUT_FOR_DELIVERY':
                return 'DELIVERING';
            case 'DELIVERED':
                return 'COMPLETED';
            case 'CANCELED':
                return 'CANCELED';
            default:
                return 'PENDING';
        }
    }
    async auditSupport(endpoint, phone, success, correlationId, ip, orderCode, responseSnippet) {
        const phoneHash = phone ? (0, crypto_1.createHash)('sha256').update(phone).digest('hex') : undefined;
        await this.prisma.supportQueryAudit.create({
            data: {
                endpoint,
                phoneHash,
                phoneMasked: this.maskPhone(phone),
                success,
                correlationId,
                ip,
                orderCode: orderCode ?? null,
                responseSnippet: responseSnippet ?? null,
            },
        });
    }
    async bumpOrThrow(key, limit, ttl, message) {
        const current = (await this.cache.get(key)) ?? 0;
        if (current >= limit) {
            throw new common_1.BadRequestException(message);
        }
        await this.cache.set(key, current + 1, ttl);
    }
};
exports.AutomationSupportService = AutomationSupportService;
exports.AutomationSupportService = AutomationSupportService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService,
        automation_events_service_1.AutomationEventsService, Object])
], AutomationSupportService);
//# sourceMappingURL=automation-support.service.js.map