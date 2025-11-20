import { Injectable, Logger } from '@nestjs/common';
import { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DeliveryConfig, DeliveryQuote, DeliveryZone, LoyaltyConfig } from './settings.types';
import { DomainError, ErrorCode } from '../common/errors';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cacheKey = 'settings:global';
  private readonly cacheTtlSec = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getSettings(): Promise<Setting> {
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

  async refresh(): Promise<Setting> {
    await this.clearCache();
    return this.getSettings();
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const settings = await this.getSettings();
    return this.normalizeDeliveryZones(settings.deliveryZones);
  }

  async getActiveDeliveryZones(): Promise<DeliveryZone[]> {
    const zones = await this.getDeliveryZones();
    return zones.filter((zone) => zone.isActive);
  }

  async getZoneById(zoneId: string, options?: { includeInactive?: boolean }): Promise<DeliveryZone | undefined> {
    if (!zoneId) return undefined;
    const zones = options?.includeInactive ? await this.getDeliveryZones() : await this.getActiveDeliveryZones();
    return zones.find((zone) => zone.id === zoneId);
  }

  async getDeliveryConfig(): Promise<DeliveryConfig> {
    const settings = await this.getSettings();
    return {
      deliveryFeeCents: settings.deliveryFeeCents ?? 0,
      freeDeliveryMinimumCents: settings.freeDeliveryMinimumCents ?? 0,
      estimatedDeliveryTime: settings.estimatedDeliveryTime,
      maxDeliveryRadiusKm: settings.maxDeliveryRadiusKm,
      deliveryZones: this.normalizeDeliveryZones(settings.deliveryZones),
    };
  }

  async computeDeliveryQuote(params: { subtotalCents: number; zoneId?: string | null }): Promise<DeliveryQuote> {
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
    const baseShipping =
      config.freeDeliveryMinimumCents > 0 && params.subtotalCents >= config.freeDeliveryMinimumCents
        ? 0
        : config.deliveryFeeCents ?? 0;
    return {
      shippingFeeCents: baseShipping,
      estimatedDeliveryTime: config.estimatedDeliveryTime ?? null,
    };
  }

  async getLoyaltyConfig(): Promise<LoyaltyConfig> {
    const settings = await this.getSettings();
    const earnRate =
      settings.loyaltyEarnRate ??
      (settings.loyaltyEarnPerCents > 0
        ? settings.loyaltyEarnPoints / settings.loyaltyEarnPerCents
        : 0);
    const redeemRateValue =
      settings.loyaltyRedeemRateValue ??
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

  ensureZoneActive(zoneId: string, zones: DeliveryZone[]): DeliveryZone {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) {
      throw new DomainError(ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Selected delivery zone is not available');
    }
    if (!zone.isActive) {
      throw new DomainError(ErrorCode.DELIVERY_ZONE_INACTIVE, 'Selected delivery zone is inactive');
    }
    return zone;
  }

  deserializeDeliveryZones(raw: any): DeliveryZone[] {
    return this.normalizeDeliveryZones(raw);
  }

  private normalizeDeliveryZones(input: any): DeliveryZone[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((zone) => this.normalizeDeliveryZone(zone))
      .filter((zone): zone is DeliveryZone => Boolean(zone));
  }

  private normalizeDeliveryZone(zone: any): DeliveryZone | undefined {
    if (!zone || typeof zone !== 'object') return undefined;
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

  private toNonNegativeInt(value: any): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  }

  private formatEta(etaMinutes?: number): string | null {
    if (!etaMinutes || etaMinutes <= 0) return null;
    return `${etaMinutes} min`;
  }
}
