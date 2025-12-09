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
var SettingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
const errors_1 = require("../common/errors");
let SettingsService = SettingsService_1 = class SettingsService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
        this.logger = new common_1.Logger(SettingsService_1.name);
        this.cacheKey = 'settings:global';
        this.cacheTtlSec = 300;
        this.zonesCacheKey = 'settings:zones';
        this.zonesCacheTtlSec = 120;
    }
    async getSettings() {
        return this.cache.wrap(this.cacheKey, async () => {
            const existing = await this.prisma.setting.findFirst();
            if (existing) {
                return existing;
            }
            this.logger.warn('Settings row missing. Creating default settings row.');
            return this.prisma.setting.create({
                data: { currency: 'EGP' },
            });
        }, this.cacheTtlSec);
    }
    async clearCache() {
        await this.cache.del(this.cacheKey);
        await this.cache.del(this.zonesCacheKey);
    }
    async refresh() {
        await this.clearCache();
        return this.getSettings();
    }
    async getDeliveryZones(options) {
        const includeInactive = options?.includeInactive ?? true;
        const cacheKey = `${this.zonesCacheKey}:${includeInactive ? 'all' : 'active'}`;
        const zones = await this.cache.wrap(cacheKey, async () => {
            const where = {};
            if (!includeInactive)
                where.isActive = true;
            try {
                const results = await this.prisma.deliveryZone.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                });
                const normalized = this.normalizeDeliveryZones(results);
                if (normalized.length > 0 || includeInactive) {
                    return normalized;
                }
                const settings = await this.getSettings();
                return this.normalizeDeliveryZones(settings.deliveryZones);
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
                    this.logger.warn('DeliveryZone table not found; falling back to legacy settings.deliveryZones. Run migrations to create the table.');
                    const settings = await this.getSettings();
                    return this.normalizeDeliveryZones(settings.deliveryZones);
                }
                throw error;
            }
        }, this.zonesCacheTtlSec);
        return includeInactive ? zones : zones.filter((zone) => zone.isActive);
    }
    async getActiveDeliveryZones() {
        return this.getDeliveryZones({ includeInactive: false });
    }
    async getZoneById(zoneId, options) {
        if (!zoneId)
            return undefined;
        const zones = await this.getDeliveryZones({
            includeInactive: options?.includeInactive ?? false,
        });
        return zones.find((zone) => zone.id === zoneId);
    }
    async listZones(params) {
        const where = {};
        if (params?.isActive !== undefined)
            where.isActive = params.isActive;
        if (params?.search) {
            where.OR = [
                { nameEn: { contains: params.search, mode: 'insensitive' } },
                { nameAr: { contains: params.search, mode: 'insensitive' } },
                { city: { contains: params.search, mode: 'insensitive' } },
                { region: { contains: params.search, mode: 'insensitive' } },
            ];
        }
        const pageSize = Math.min(params?.pageSize ?? 20, 100);
        const page = Math.max(params?.page ?? 1, 1);
        const skip = (page - 1) * pageSize;
        try {
            const [items, total] = await this.prisma.$transaction([
                this.prisma.deliveryZone.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: pageSize,
                }),
                this.prisma.deliveryZone.count({ where }),
            ]);
            return {
                items: this.normalizeDeliveryZones(items),
                total,
                page,
                pageSize,
            };
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
                this.logger.warn('DeliveryZone table not found; falling back to legacy settings.deliveryZones. Run migrations to create the table.');
                const legacyZones = this.normalizeDeliveryZones((await this.getSettings()).deliveryZones);
                let filtered = legacyZones;
                if (params?.isActive !== undefined) {
                    filtered = filtered.filter((zone) => zone.isActive === params.isActive);
                }
                if (params?.search) {
                    const term = params.search.toLowerCase();
                    filtered = filtered.filter((zone) => [zone.nameEn, zone.nameAr, zone.city, zone.region]
                        .filter(Boolean)
                        .some((value) => String(value).toLowerCase().includes(term)));
                }
                const total = filtered.length;
                const items = filtered.slice(skip, skip + pageSize);
                return { items, total, page, pageSize };
            }
            throw error;
        }
    }
    async createZone(data) {
        const zone = await this.prisma.deliveryZone.create({
            data: {
                nameEn: data.nameEn,
                nameAr: data.nameAr || '',
                city: data.city,
                region: data.region,
                feeCents: this.toNonNegativeInt(data.feeCents),
                etaMinutes: data.etaMinutes === undefined ? null : this.toNonNegativeInt(data.etaMinutes),
                freeDeliveryThresholdCents: data.freeDeliveryThresholdCents === undefined || data.freeDeliveryThresholdCents === null
                    ? null
                    : this.toNonNegativeInt(data.freeDeliveryThresholdCents),
                minOrderAmountCents: data.minOrderAmountCents === undefined || data.minOrderAmountCents === null
                    ? null
                    : this.toNonNegativeInt(data.minOrderAmountCents),
                isActive: data.isActive ?? true,
            },
        });
        await this.clearCache();
        return this.normalizeDeliveryZone(zone);
    }
    async updateZone(id, data) {
        const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
        if (!existing) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found');
        }
        const zone = await this.prisma.deliveryZone.update({
            where: { id },
            data: {
                nameEn: data.nameEn ?? existing.nameEn,
                nameAr: data.nameAr ?? existing.nameAr,
                city: data.city ?? existing.city,
                region: data.region ?? existing.region,
                feeCents: data.feeCents !== undefined ? this.toNonNegativeInt(data.feeCents) : existing.feeCents,
                etaMinutes: data.etaMinutes === null
                    ? null
                    : data.etaMinutes === undefined
                        ? existing.etaMinutes
                        : this.toNonNegativeInt(data.etaMinutes),
                freeDeliveryThresholdCents: data.freeDeliveryThresholdCents === null
                    ? null
                    : data.freeDeliveryThresholdCents === undefined
                        ? existing.freeDeliveryThresholdCents
                        : this.toNonNegativeInt(data.freeDeliveryThresholdCents),
                minOrderAmountCents: data.minOrderAmountCents === null
                    ? null
                    : data.minOrderAmountCents === undefined
                        ? existing.minOrderAmountCents
                        : this.toNonNegativeInt(data.minOrderAmountCents),
                isActive: data.isActive ?? existing.isActive,
            },
        });
        await this.clearCache();
        return this.normalizeDeliveryZone(zone);
    }
    async deleteZone(id) {
        const usage = await this.prisma.order.count({ where: { deliveryZoneId: id } });
        const addresses = await this.prisma.address.count({ where: { zoneId: id } });
        if (usage > 0 || addresses > 0) {
            throw new errors_1.DomainError(errors_1.ErrorCode.VALIDATION_FAILED, 'Cannot delete a delivery zone that is linked to orders or addresses');
        }
        await this.prisma.deliveryZone.delete({ where: { id } });
        await this.clearCache();
        return { success: true };
    }
    async replaceZones(zones) {
        await this.prisma.$transaction([
            this.prisma.deliveryZone.deleteMany({}),
            this.prisma.deliveryZone.createMany({
                data: zones.map((zone) => ({
                    id: zone.id,
                    nameEn: zone.nameEn,
                    nameAr: zone.nameAr ?? '',
                    city: zone.city,
                    region: zone.region,
                    feeCents: this.toNonNegativeInt(zone.feeCents ?? zone.fee ?? 0),
                    etaMinutes: zone.etaMinutes ?? null,
                    freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents ?? null,
                    minOrderAmountCents: zone.minOrderAmountCents ?? null,
                    isActive: zone.isActive ?? true,
                })),
            }),
        ]);
        await this.clearCache();
        return this.getDeliveryZones();
    }
    async getDeliveryConfig() {
        const settings = await this.getSettings();
        const deliveryZones = await this.getDeliveryZones({ includeInactive: true });
        return {
            deliveryFeeCents: settings.deliveryFeeCents ?? 0,
            freeDeliveryMinimumCents: settings.freeDeliveryMinimumCents ?? 0,
            estimatedDeliveryTime: settings.estimatedDeliveryTime,
            maxDeliveryRadiusKm: settings.maxDeliveryRadiusKm,
            deliveryZones,
        };
    }
    async computeDeliveryQuote(params) {
        const config = await this.getDeliveryConfig();
        if (params.subtotalCents <= 0) {
            return {
                shippingFeeCents: 0,
                estimatedDeliveryTime: config.estimatedDeliveryTime ?? null,
            };
        }
        if (params.zoneId) {
            const zone = config.deliveryZones.find((candidate) => candidate.id === params.zoneId);
            if (!zone) {
                throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Selected delivery zone is not available');
            }
            if (!zone.isActive) {
                throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_INACTIVE, 'Selected delivery zone is inactive');
            }
            if (zone.minOrderAmountCents && params.subtotalCents < zone.minOrderAmountCents) {
                throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_INVALID_ZONE, 'Order subtotal does not meet the minimum for this delivery zone');
            }
            const threshold = zone.freeDeliveryThresholdCents ?? 0;
            const shippingFeeCents = threshold > 0 && params.subtotalCents >= threshold ? 0 : zone.feeCents;
            return {
                shippingFeeCents,
                deliveryZoneId: zone.id,
                deliveryZoneName: zone.nameEn,
                etaMinutes: zone.etaMinutes,
                estimatedDeliveryTime: this.formatEta(zone.etaMinutes) ?? config.estimatedDeliveryTime ?? null,
            };
        }
        const baseShipping = config.freeDeliveryMinimumCents > 0 && params.subtotalCents >= config.freeDeliveryMinimumCents
            ? 0
            : config.deliveryFeeCents ?? 0;
        return {
            shippingFeeCents: baseShipping,
            estimatedDeliveryTime: config.estimatedDeliveryTime ?? null,
        };
    }
    async getLoyaltyConfig() {
        const settings = await this.getSettings();
        const earnRate = settings.loyaltyEarnRate ??
            (settings.loyaltyEarnPerCents > 0
                ? settings.loyaltyEarnPoints / settings.loyaltyEarnPerCents
                : 0);
        const redeemRateValue = settings.loyaltyRedeemRateValue ??
            (settings.loyaltyRedeemRate > 0
                ? settings.loyaltyRedeemUnitCents / settings.loyaltyRedeemRate
                : 0);
        return {
            enabled: settings.loyaltyEnabled ?? false,
            earnRate,
            earnPoints: settings.loyaltyEarnPoints ?? 0,
            earnPerCents: settings.loyaltyEarnPerCents ?? 0,
            redeemRateValue,
            redeemRate: settings.loyaltyRedeemRate ?? 0,
            redeemUnitCents: settings.loyaltyRedeemUnitCents ?? 0,
            minRedeemPoints: settings.loyaltyMinRedeemPoints ?? 0,
            maxDiscountPercent: settings.loyaltyMaxDiscountPercent ?? 0,
            maxRedeemPerOrder: settings.loyaltyMaxRedeemPerOrder ?? 0,
            resetThreshold: settings.loyaltyResetThreshold ?? 0,
        };
    }
    ensureZoneActive(zoneId, zones) {
        const zone = zones.find((z) => z.id === zoneId);
        if (!zone) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Selected delivery zone is not available');
        }
        if (!zone.isActive) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_INACTIVE, 'Selected delivery zone is inactive');
        }
        return zone;
    }
    validateZoneConfig(zones) {
        return zones
            .map((zone) => {
            const issues = [];
            if (!zone.nameEn.trim())
                issues.push('name');
            if (zone.feeCents === undefined || zone.feeCents === null)
                issues.push('feeCents');
            if (zone.etaMinutes === undefined || zone.etaMinutes === null)
                issues.push('etaMinutes');
            if (!zone.city && !zone.region)
                issues.push('location');
            if (zone.minOrderAmountCents !== null && zone.minOrderAmountCents !== undefined && zone.minOrderAmountCents < 0) {
                issues.push('minOrderAmountCents');
            }
            return issues.length ? { id: zone.id, issues, isActive: zone.isActive } : null;
        })
            .filter((entry) => Boolean(entry));
    }
    deserializeDeliveryZones(raw) {
        return this.normalizeDeliveryZones(raw);
    }
    normalizeDeliveryZones(input) {
        if (!Array.isArray(input))
            return [];
        return input
            .map((zone) => this.normalizeDeliveryZone(zone))
            .filter((zone) => Boolean(zone));
    }
    normalizeDeliveryZone(zone) {
        if (!zone || typeof zone !== 'object')
            return undefined;
        const id = String(zone.id ?? '').trim();
        const nameEn = String(zone.nameEn ?? zone.name ?? '').trim();
        const nameAr = String(zone.nameAr ?? '').trim();
        if (!id || !nameEn) {
            return undefined;
        }
        const feeCents = this.toNonNegativeInt(zone.feeCents ?? zone.fee);
        const etaMinutes = zone.etaMinutes === undefined || zone.etaMinutes === null ? undefined : this.toNonNegativeInt(zone.etaMinutes);
        const freeDeliveryThresholdCents = zone.freeDeliveryThresholdCents === undefined || zone.freeDeliveryThresholdCents === null
            ? undefined
            : this.toNonNegativeInt(zone.freeDeliveryThresholdCents);
        const minOrderAmountCents = zone.minOrderAmountCents === undefined || zone.minOrderAmountCents === null
            ? undefined
            : this.toNonNegativeInt(zone.minOrderAmountCents);
        const isActive = zone.isActive ?? zone.enabled ?? true;
        return {
            id,
            nameEn,
            nameAr,
            city: zone.city ?? undefined,
            region: zone.region ?? undefined,
            feeCents,
            etaMinutes,
            freeDeliveryThresholdCents,
            minOrderAmountCents,
            isActive: Boolean(isActive),
        };
    }
    toNonNegativeInt(value) {
        const parsed = Number(value ?? 0);
        if (!Number.isFinite(parsed))
            return 0;
        return Math.max(0, Math.round(parsed));
    }
    formatEta(etaMinutes) {
        if (!etaMinutes || etaMinutes <= 0)
            return null;
        return `${etaMinutes} min`;
    }
    formatEtaLocalized(etaMinutes, lang = 'en') {
        if (!etaMinutes || etaMinutes <= 0)
            return null;
        const minutes = `${etaMinutes}`;
        if (lang === 'ar') {
            return `${minutes} دقيقة`;
        }
        return `${minutes} min`;
    }
    buildZoneMessages(zone) {
        const feeCents = zone.feeCents ?? 0;
        const freeThreshold = zone.freeDeliveryThresholdCents ?? 0;
        const feeEn = freeThreshold > 0
            ? `Delivery fee ${(feeCents / 100).toFixed(2)} (free over ${(freeThreshold / 100).toFixed(2)})`
            : `Delivery fee ${(feeCents / 100).toFixed(2)}`;
        const feeAr = freeThreshold > 0
            ? `رسوم التوصيل ${(feeCents / 100).toFixed(2)} (مجانا فوق ${(freeThreshold / 100).toFixed(2)})`
            : `رسوم التوصيل ${(feeCents / 100).toFixed(2)}`;
        return {
            etaTextEn: this.formatEtaLocalized(zone.etaMinutes, 'en'),
            etaTextAr: this.formatEtaLocalized(zone.etaMinutes, 'ar'),
            feeMessageEn: feeEn,
            feeMessageAr: feeAr,
            freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents ?? null,
        };
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = SettingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map