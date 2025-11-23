import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DeliveryConfig, DeliveryQuote, DeliveryZone, LoyaltyConfig } from './settings.types';
import { DomainError, ErrorCode } from '../common/errors';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cacheKey = 'settings:global';
  private readonly cacheTtlSec = 300;
  private readonly zonesCacheKey = 'settings:zones';
  private readonly zonesCacheTtlSec = 120;

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
    await this.cache.del(this.zonesCacheKey);
  }

  async refresh(): Promise<Setting> {
    await this.clearCache();
    return this.getSettings();
  }

  async getDeliveryZones(options?: { includeInactive?: boolean }): Promise<DeliveryZone[]> {
    const includeInactive = options?.includeInactive ?? true;
    const cacheKey = `${this.zonesCacheKey}:${includeInactive ? 'all' : 'active'}`;
    const zones = await this.cache.wrap(
      cacheKey,
      async () => {
        const where: Prisma.DeliveryZoneWhereInput = {};
        if (!includeInactive) where.isActive = true;
        try {
          const results = await this.prisma.deliveryZone.findMany({
            where,
            orderBy: { createdAt: 'desc' },
          });
          const normalized = this.normalizeDeliveryZones(results);
          if (normalized.length > 0 || includeInactive) {
            return normalized;
          }
          // fallback to legacy settings JSON for environments not migrated yet
          const settings = await this.getSettings();
          return this.normalizeDeliveryZones(settings.deliveryZones);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
            this.logger.warn(
              'DeliveryZone table not found; falling back to legacy settings.deliveryZones. Run migrations to create the table.',
            );
            const settings = await this.getSettings();
            return this.normalizeDeliveryZones(settings.deliveryZones);
          }
          throw error;
        }
      },
      this.zonesCacheTtlSec,
    );
    return includeInactive ? zones : zones.filter((zone) => zone.isActive);
  }

  async getActiveDeliveryZones(): Promise<DeliveryZone[]> {
    return this.getDeliveryZones({ includeInactive: false });
  }

  async getZoneById(zoneId: string, options?: { includeInactive?: boolean }): Promise<DeliveryZone | undefined> {
    if (!zoneId) return undefined;
    const zones = await this.getDeliveryZones({
      includeInactive: options?.includeInactive ?? false,
    });
    return zones.find((zone) => zone.id === zoneId);
  }

  async listZones(params?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) {
    const where: Prisma.DeliveryZoneWhereInput = {};
    if (params?.isActive !== undefined) where.isActive = params.isActive;
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        this.logger.warn(
          'DeliveryZone table not found; falling back to legacy settings.deliveryZones. Run migrations to create the table.',
        );
        const legacyZones = this.normalizeDeliveryZones((await this.getSettings()).deliveryZones);
        let filtered = legacyZones;
        if (params?.isActive !== undefined) {
          filtered = filtered.filter((zone) => zone.isActive === params.isActive);
        }
        if (params?.search) {
          const term = params.search.toLowerCase();
          filtered = filtered.filter((zone) =>
            [zone.nameEn, zone.nameAr, (zone as any).city, (zone as any).region]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(term)),
          );
        }
        const total = filtered.length;
        const items = filtered.slice(skip, skip + pageSize);
        return { items, total, page, pageSize };
      }
      throw error;
    }
  }

  async createZone(data: {
    nameEn: string;
    nameAr?: string;
    city?: string;
    region?: string;
    feeCents: number;
    etaMinutes?: number;
    freeDeliveryThresholdCents?: number | null;
    minOrderAmountCents?: number | null;
    isActive?: boolean;
  }) {
    const zone = await this.prisma.deliveryZone.create({
      data: {
        nameEn: data.nameEn,
        nameAr: data.nameAr || '',
        city: data.city,
        region: data.region,
        feeCents: this.toNonNegativeInt(data.feeCents),
        etaMinutes: data.etaMinutes === undefined ? null : this.toNonNegativeInt(data.etaMinutes),
        freeDeliveryThresholdCents:
          data.freeDeliveryThresholdCents === undefined || data.freeDeliveryThresholdCents === null
            ? null
            : this.toNonNegativeInt(data.freeDeliveryThresholdCents),
        minOrderAmountCents:
          data.minOrderAmountCents === undefined || data.minOrderAmountCents === null
            ? null
            : this.toNonNegativeInt(data.minOrderAmountCents),
        isActive: data.isActive ?? true,
      },
    });
    await this.clearCache();
    return this.normalizeDeliveryZone(zone)!;
  }

  async updateZone(
    id: string,
    data: {
      nameEn?: string;
      nameAr?: string;
      city?: string;
      region?: string;
      feeCents?: number;
      etaMinutes?: number | null;
      freeDeliveryThresholdCents?: number | null;
      minOrderAmountCents?: number | null;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) {
      throw new DomainError(ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found');
    }
    const zone = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        nameEn: data.nameEn ?? existing.nameEn,
        nameAr: data.nameAr ?? existing.nameAr,
        city: data.city ?? existing.city,
        region: data.region ?? existing.region,
        feeCents: data.feeCents !== undefined ? this.toNonNegativeInt(data.feeCents) : existing.feeCents,
        etaMinutes:
          data.etaMinutes === null
            ? null
            : data.etaMinutes === undefined
              ? existing.etaMinutes
              : this.toNonNegativeInt(data.etaMinutes),
        freeDeliveryThresholdCents:
          data.freeDeliveryThresholdCents === null
            ? null
            : data.freeDeliveryThresholdCents === undefined
              ? existing.freeDeliveryThresholdCents
              : this.toNonNegativeInt(data.freeDeliveryThresholdCents),
        minOrderAmountCents:
          data.minOrderAmountCents === null
            ? null
            : data.minOrderAmountCents === undefined
              ? existing.minOrderAmountCents
              : this.toNonNegativeInt(data.minOrderAmountCents),
        isActive: data.isActive ?? existing.isActive,
      },
    });
    await this.clearCache();
    return this.normalizeDeliveryZone(zone)!;
  }

  async deleteZone(id: string) {
    const usage = await this.prisma.order.count({ where: { deliveryZoneId: id } });
    const addresses = await this.prisma.address.count({ where: { zoneId: id } });
    if (usage > 0 || addresses > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Cannot delete a delivery zone that is linked to orders or addresses',
      );
    }
    await this.prisma.deliveryZone.delete({ where: { id } });
    await this.clearCache();
    return { success: true };
  }

  async replaceZones(zones: DeliveryZone[]) {
    await this.prisma.$transaction([
      this.prisma.deliveryZone.deleteMany({}),
      this.prisma.deliveryZone.createMany({
        data: zones.map((zone) => ({
          id: zone.id,
          nameEn: zone.nameEn,
          nameAr: zone.nameAr ?? '',
          city: (zone as any).city,
          region: (zone as any).region,
          feeCents: this.toNonNegativeInt((zone as any).feeCents ?? (zone as any).fee ?? 0),
          etaMinutes: zone.etaMinutes ?? null,
          freeDeliveryThresholdCents: (zone as any).freeDeliveryThresholdCents ?? null,
          minOrderAmountCents: (zone as any).minOrderAmountCents ?? null,
          isActive: zone.isActive ?? true,
        })),
      }),
    ]);
    await this.clearCache();
    return this.getDeliveryZones();
  }

  async getDeliveryConfig(): Promise<DeliveryConfig> {
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
      if (zone.minOrderAmountCents && params.subtotalCents < zone.minOrderAmountCents) {
        throw new DomainError(
          ErrorCode.ADDRESS_INVALID_ZONE,
          'Order subtotal does not meet the minimum for this delivery zone',
        );
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
    const etaMinutes =
      zone.etaMinutes === undefined || zone.etaMinutes === null ? undefined : this.toNonNegativeInt(zone.etaMinutes);
    const freeDeliveryThresholdCents =
      zone.freeDeliveryThresholdCents === undefined || zone.freeDeliveryThresholdCents === null
        ? undefined
        : this.toNonNegativeInt(zone.freeDeliveryThresholdCents);
    const minOrderAmountCents =
      zone.minOrderAmountCents === undefined || zone.minOrderAmountCents === null
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
