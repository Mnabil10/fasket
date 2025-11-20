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
    }
    async refresh() {
        await this.clearCache();
        return this.getSettings();
    }
    async getDeliveryZones() {
        const settings = await this.getSettings();
        return this.normalizeDeliveryZones(settings.deliveryZones);
    }
    async getActiveDeliveryZones() {
        const zones = await this.getDeliveryZones();
        return zones.filter((zone) => zone.isActive);
    }
    async getZoneById(zoneId, options) {
        if (!zoneId)
            return undefined;
        const zones = options?.includeInactive ? await this.getDeliveryZones() : await this.getActiveDeliveryZones();
        return zones.find((zone) => zone.id === zoneId);
    }
    async getDeliveryConfig() {
        const settings = await this.getSettings();
        return {
            deliveryFeeCents: settings.deliveryFeeCents ?? 0,
            freeDeliveryMinimumCents: settings.freeDeliveryMinimumCents ?? 0,
            estimatedDeliveryTime: settings.estimatedDeliveryTime,
            maxDeliveryRadiusKm: settings.maxDeliveryRadiusKm,
            deliveryZones: this.normalizeDeliveryZones(settings.deliveryZones),
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
        const zone = params.zoneId
            ? config.deliveryZones.find((candidate) => candidate.id === params.zoneId && candidate.isActive)
            : undefined;
        if (zone) {
            return {
                shippingFeeCents: zone.feeCents,
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
        const etaMinutes = zone.etaMinutes === undefined ? undefined : this.toNonNegativeInt(zone.etaMinutes);
        const isActive = zone.isActive ?? zone.enabled ?? false;
        return {
            id,
            nameEn,
            nameAr,
            feeCents,
            etaMinutes,
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
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = SettingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map