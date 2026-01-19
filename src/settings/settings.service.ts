import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DeliveryMode, Prisma, Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DeliveryConfig, DeliveryQuote, DeliveryZone, DistanceDeliveryQuote, LoyaltyConfig } from './settings.types';
import { DomainError, ErrorCode } from '../common/errors';
import { DeliveryCampaignsService } from '../delivery-campaigns/delivery-campaigns.service';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cacheKey = 'settings:global';
  private readonly cacheTtlSec = 300;
  private readonly zonesCacheKey = 'settings:zones';
  private readonly zonesCacheTtlSec = 120;
  private readonly routingBaseUrl = String(process.env.ROUTING_BASE_URL ?? '').trim();
  private readonly routingTimeoutMs = Number(process.env.ROUTING_TIMEOUT_MS ?? 2500);
  private readonly routingFallbackSpeedKph = Number(process.env.ROUTING_FALLBACK_SPEED_KPH ?? 25);
  private readonly distancePricingEnabled = String(process.env.DELIVERY_DISTANCE_ENABLED ?? 'true') === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly campaigns: DeliveryCampaignsService,
  ) {}

  async getSettings(): Promise<Setting> {
    return this.cache.wrap(this.cacheKey, async () => {
      const existing = await this.prisma.setting.findFirst();
      if (existing) {
        return existing;
      }
      this.logger.warn('Settings row missing. Creating default settings row.');
      return this.prisma.setting.create({
        data: { currency: 'EGP', timezone: 'Africa/Cairo' },
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

  resolveZoneName(zone?: DeliveryZone | null, fallback?: string | null): string | null {
    if (!zone) return fallback ?? null;
    const nameAr = String(zone.nameAr ?? '').trim();
    if (nameAr) return nameAr;
    const nameEn = String(zone.nameEn ?? '').trim();
    if (nameEn) return nameEn;
    return fallback ?? null;
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
      distancePricingEnabled: this.distancePricingEnabled,
      deliveryZones,
    };
  }

  async listDeliveryWindows(params: {
    providerId?: string;
    branchId?: string;
    isActive?: boolean;
    day?: number;
  }) {
    const where: Prisma.DeliveryWindowWhereInput = {};
    if (params.providerId) where.providerId = params.providerId;
    if (params.branchId) where.branchId = params.branchId;
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const windows = await this.prisma.deliveryWindow.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { startMinutes: 'asc' }],
    });
    if (params.day === undefined || params.day === null || !Number.isFinite(params.day)) {
      return windows;
    }
    const day = Math.floor(params.day);
    return windows.filter((window) => {
      if (!Array.isArray(window.daysOfWeek) || window.daysOfWeek.length === 0) {
        return true;
      }
      return window.daysOfWeek.includes(day);
    });
  }

  async computeDeliveryQuote(params: { subtotalCents: number; zoneId?: string | null }): Promise<DeliveryQuote> {
    const config = await this.getDeliveryConfig();
    if (params.subtotalCents <= 0) {
      return {
        shippingFeeCents: 0,
        estimatedDeliveryTime: config.estimatedDeliveryTime ?? null,
        deliveryPricing: {
          baseFeeCents: 0,
          appliedFeeCents: 0,
          campaignId: null,
          campaignName: null,
        },
      };
    }
    if (params.zoneId) {
      const zone = config.deliveryZones.find((candidate) => candidate.id === params.zoneId);
      if (!zone) {
        throw new DomainError(ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Selected delivery zone is not available');
      }
      if (!zone.isActive) {
        throw new DomainError(ErrorCode.DELIVERY_ZONE_INACTIVE, 'Selected delivery zone is inactive');
      }
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
        deliveryZoneName: this.resolveZoneName(zone) ?? undefined,
        etaMinutes: zone.etaMinutes,
        estimatedDeliveryTime: this.formatEta(zone.etaMinutes) ?? config.estimatedDeliveryTime ?? null,
        deliveryPricing: {
          baseFeeCents: shippingFeeCents,
          appliedFeeCents: shippingFeeCents,
          campaignId: null,
          campaignName: null,
        },
      };
    }
    const baseShipping =
      config.freeDeliveryMinimumCents > 0 && params.subtotalCents >= config.freeDeliveryMinimumCents
        ? 0
        : config.deliveryFeeCents ?? 0;
    return {
      shippingFeeCents: baseShipping,
      estimatedDeliveryTime: config.estimatedDeliveryTime ?? null,
      deliveryPricing: {
        baseFeeCents: baseShipping,
        appliedFeeCents: baseShipping,
        campaignId: null,
        campaignName: null,
      },
    };
  }

  isDistancePricingEnabled() {
    return this.distancePricingEnabled;
  }

  async computeBranchDeliveryQuote(params: {
    branchId: string;
    addressLat?: number | null;
    addressLng?: number | null;
    zoneId?: string | null;
    subtotalCents?: number | null;
  }): Promise<DistanceDeliveryQuote> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: params.branchId },
      include: {
        provider: {
          select: {
            deliveryRatePerKmCents: true,
            minDeliveryFeeCents: true,
            maxDeliveryFeeCents: true,
            deliveryMode: true,
          },
        },
      },
    });
    if (!branch) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Branch not found');
    }
    if (branch.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Branch is inactive');
    }
    const settings = await this.getSettings();
    const deliveryMode = branch.deliveryMode ?? branch.provider?.deliveryMode ?? DeliveryMode.PLATFORM;
    const minFee =
      branch.minDeliveryFeeCents ??
      branch.provider?.minDeliveryFeeCents ??
      settings.minDeliveryFeeCents ??
      null;
    const maxFee =
      branch.maxDeliveryFeeCents ??
      branch.provider?.maxDeliveryFeeCents ??
      settings.maxDeliveryFeeCents ??
      null;

    const subtotalCents =
      typeof params.subtotalCents === 'number' && Number.isFinite(params.subtotalCents)
        ? Math.max(0, Math.floor(params.subtotalCents))
        : null;
    const zoneId = params.zoneId ?? null;
    if (zoneId) {
      const zone = await this.getZoneById(zoneId);
      if (!zone) {
        throw new DomainError(ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Selected delivery zone is not available');
      }
      const providerPricing = await this.prisma.providerDeliveryZonePricing.findFirst({
        where: { providerId: branch.providerId, zoneId, isActive: true },
      });
      if (providerPricing) {
        const normalizedSubtotal = subtotalCents ?? 0;
        if (zone.minOrderAmountCents && subtotalCents !== null && normalizedSubtotal < zone.minOrderAmountCents) {
          throw new DomainError(
            ErrorCode.ADDRESS_INVALID_ZONE,
            'Order subtotal does not meet the minimum for this delivery zone',
          );
        }
        let shippingFeeCents = providerPricing.feeCents;
        if (
          zone.freeDeliveryThresholdCents &&
          subtotalCents !== null &&
          normalizedSubtotal >= zone.freeDeliveryThresholdCents
        ) {
          shippingFeeCents = 0;
        }
        if (deliveryMode === DeliveryMode.MERCHANT) {
          shippingFeeCents = 0;
        }
        const baseFeeCents = shippingFeeCents;
        const campaign = deliveryMode === DeliveryMode.MERCHANT
          ? null
          : await this.applyCampaignPricing({
              baseFeeCents,
              zoneId: zone.id,
              providerId: branch.providerId,
            });
        const appliedFeeCents = campaign?.appliedFeeCents ?? baseFeeCents;
        shippingFeeCents = appliedFeeCents;
        return {
          shippingFeeCents,
          deliveryZoneId: zone.id,
          deliveryZoneName: this.resolveZoneName(zone) ?? undefined,
          distanceKm: null,
          ratePerKmCents: null,
          minDeliveryFeeCents: minFee,
          maxDeliveryFeeCents: maxFee,
          etaMinutes: zone.etaMinutes ?? undefined,
          estimatedDeliveryTime: this.formatEta(zone.etaMinutes) ?? settings.estimatedDeliveryTime ?? null,
          deliveryPricing: {
            baseFeeCents,
            appliedFeeCents,
            campaignId: campaign?.campaignId ?? null,
            campaignName: campaign?.campaignName ?? null,
          },
        };
      }
    }

    if (!this.distancePricingEnabled) {
      if (zoneId && subtotalCents !== null) {
        const quote = await this.computeDeliveryQuote({
          subtotalCents,
          zoneId,
        });
        let shippingFeeCents = quote.shippingFeeCents;
        if (deliveryMode === DeliveryMode.MERCHANT) {
          shippingFeeCents = 0;
        }
        const baseFeeCents = shippingFeeCents;
        const campaign = deliveryMode === DeliveryMode.MERCHANT
          ? null
          : await this.applyCampaignPricing({
              baseFeeCents,
              zoneId,
              providerId: branch.providerId,
            });
        const appliedFeeCents = campaign?.appliedFeeCents ?? baseFeeCents;
        shippingFeeCents = appliedFeeCents;
        return {
          shippingFeeCents,
          deliveryZoneId: quote.deliveryZoneId,
          deliveryZoneName: quote.deliveryZoneName,
          distanceKm: null,
          ratePerKmCents: null,
          minDeliveryFeeCents: minFee,
          maxDeliveryFeeCents: maxFee,
          etaMinutes: quote.etaMinutes ?? undefined,
          estimatedDeliveryTime: quote.estimatedDeliveryTime ?? settings.estimatedDeliveryTime ?? null,
          deliveryPricing: {
            baseFeeCents,
            appliedFeeCents,
            campaignId: campaign?.campaignId ?? null,
            campaignName: campaign?.campaignName ?? null,
          },
        };
      }

      let shippingFeeCents = settings.deliveryFeeCents ?? 0;
      if (minFee !== null && minFee !== undefined) {
        shippingFeeCents = Math.max(shippingFeeCents, minFee);
      }
      if (maxFee !== null && maxFee !== undefined) {
        shippingFeeCents = Math.min(shippingFeeCents, maxFee);
      }
      if (deliveryMode === DeliveryMode.MERCHANT) {
        shippingFeeCents = 0;
      }
      const baseFeeCents = shippingFeeCents;
      const campaign = deliveryMode === DeliveryMode.MERCHANT
        ? null
        : await this.applyCampaignPricing({
            baseFeeCents,
            zoneId,
            providerId: branch.providerId,
          });
      const appliedFeeCents = campaign?.appliedFeeCents ?? baseFeeCents;
      shippingFeeCents = appliedFeeCents;
      return {
        shippingFeeCents,
        distanceKm: null,
        ratePerKmCents: null,
        minDeliveryFeeCents: minFee,
        maxDeliveryFeeCents: maxFee,
        etaMinutes: undefined,
        estimatedDeliveryTime: settings.estimatedDeliveryTime ?? null,
        deliveryPricing: {
          baseFeeCents,
          appliedFeeCents,
          campaignId: campaign?.campaignId ?? null,
          campaignName: campaign?.campaignName ?? null,
        },
      };
    }

    if (!Number.isFinite(params.addressLat) || !Number.isFinite(params.addressLng)) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Address location is missing');
    }
    if (branch.lat === null || branch.lat === undefined || branch.lng === null || branch.lng === undefined) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Branch location is missing');
    }

    const route = await this.getRouteSummary({
      originLat: branch.lat,
      originLng: branch.lng,
      destinationLat: params.addressLat!,
      destinationLng: params.addressLng!,
    });
    const distanceKm =
      route?.distanceKm ??
      this.haversineKm(branch.lat, branch.lng, params.addressLat!, params.addressLng!);
    if (branch.deliveryRadiusKm && distanceKm > branch.deliveryRadiusKm) {
      throw new DomainError(ErrorCode.ADDRESS_INVALID_ZONE, 'Address is outside delivery radius');
    }

    const ratePerKmCents =
      branch.deliveryRatePerKmCents ??
      branch.provider?.deliveryRatePerKmCents ??
      settings.deliveryRatePerKmCents ??
      0;

    let shippingFeeCents = Math.ceil(distanceKm * ratePerKmCents);
    if (minFee !== null && minFee !== undefined) {
      shippingFeeCents = Math.max(shippingFeeCents, minFee);
    }
    if (maxFee !== null && maxFee !== undefined) {
      shippingFeeCents = Math.min(shippingFeeCents, maxFee);
    }
    if (deliveryMode === DeliveryMode.MERCHANT) {
      shippingFeeCents = 0;
    }
    const baseFeeCents = shippingFeeCents;
    const campaign = deliveryMode === DeliveryMode.MERCHANT
      ? null
      : await this.applyCampaignPricing({
          baseFeeCents,
          zoneId,
          providerId: branch.providerId,
        });
    const appliedFeeCents = campaign?.appliedFeeCents ?? baseFeeCents;
    shippingFeeCents = appliedFeeCents;

    const etaMinutes = route?.durationMinutes ?? this.estimateEtaMinutes(distanceKm) ?? undefined;
    const estimatedDeliveryTime = this.formatEta(etaMinutes) ?? settings.estimatedDeliveryTime ?? null;

    return {
      shippingFeeCents,
      distanceKm,
      ratePerKmCents,
      minDeliveryFeeCents: minFee,
      maxDeliveryFeeCents: maxFee,
      etaMinutes: etaMinutes ?? undefined,
      estimatedDeliveryTime,
      deliveryPricing: {
        baseFeeCents,
        appliedFeeCents,
        campaignId: campaign?.campaignId ?? null,
        campaignName: campaign?.campaignName ?? null,
      },
    };
  }

  private async applyCampaignPricing(params: {
    baseFeeCents: number;
    zoneId?: string | null;
    providerId?: string | null;
  }) {
    if (!params.zoneId || !params.providerId) {
      return { appliedFeeCents: params.baseFeeCents, campaignId: null, campaignName: null };
    }
    const campaign = await this.campaigns.findActiveCampaign({
      zoneId: params.zoneId,
      providerId: params.providerId,
    });
    if (!campaign) {
      return { appliedFeeCents: params.baseFeeCents, campaignId: null, campaignName: null };
    }
    const appliedFeeCents = this.toNonNegativeInt(campaign.deliveryPriceCents);
    this.logger.debug({
      msg: 'Delivery campaign applied',
      campaignId: campaign.id,
      campaignName: campaign.name,
      zoneId: params.zoneId,
      providerId: params.providerId,
      baseFeeCents: params.baseFeeCents,
      appliedFeeCents,
    });
    return { appliedFeeCents, campaignId: campaign.id, campaignName: campaign.name };
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

  validateZoneConfig(zones: DeliveryZone[]) {
    return zones
      .map((zone) => {
        const issues: string[] = [];
        if (!zone.nameEn.trim()) issues.push('name');
        if (zone.feeCents === undefined || zone.feeCents === null) issues.push('feeCents');
        if (zone.etaMinutes === undefined || zone.etaMinutes === null) issues.push('etaMinutes');
        if (!zone.city && !zone.region) issues.push('location');
        if (zone.minOrderAmountCents !== null && zone.minOrderAmountCents !== undefined && zone.minOrderAmountCents < 0) {
          issues.push('minOrderAmountCents');
        }
        return issues.length ? { id: zone.id, issues, isActive: zone.isActive } : null;
      })
      .filter((entry): entry is { id: string; issues: string[]; isActive: boolean } => Boolean(entry));
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

  private async getRouteSummary(params: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
  }): Promise<{ distanceKm: number; durationMinutes: number } | null> {
    if (!this.distancePricingEnabled) return null;
    if (!this.routingBaseUrl) return null;
    const base = this.routingBaseUrl.replace(/\/+$/, '');
    const url = `${base}/route/v1/driving/${params.originLng},${params.originLat};${params.destinationLng},${params.destinationLat}`;
    try {
      const { data } = await axios.get(url, {
        timeout: Number.isFinite(this.routingTimeoutMs) ? this.routingTimeoutMs : 2500,
        params: { overview: 'false', alternatives: 'false', steps: 'false' },
      });
      const route = data?.routes?.[0];
      if (!route || typeof route.distance !== 'number') return null;
      const distanceKm = route.distance / 1000;
      const durationMinutes = route.duration ? Math.max(1, Math.round(route.duration / 60)) : 0;
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
      return { distanceKm, durationMinutes };
    } catch (error) {
      this.logger.warn({ msg: 'Routing lookup failed, falling back to haversine', error: (error as Error).message });
      return null;
    }
  }

  private estimateEtaMinutes(distanceKm: number | null): number | null {
    if (!distanceKm || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
    const speed = this.routingFallbackSpeedKph;
    if (!Number.isFinite(speed) || speed <= 0) return null;
    return Math.max(5, Math.round((distanceKm / speed) * 60));
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  formatEtaLocalized(etaMinutes?: number, lang: 'en' | 'ar' = 'en'): string | null {
    if (!etaMinutes || etaMinutes <= 0) return null;
    const minutes = `${etaMinutes}`;
    if (lang === 'ar') {
      return `${minutes} دقيقة`;
    }
    return `${minutes} min`;
  }

  buildZoneMessages(zone: DeliveryZone) {
    const feeCents = zone.feeCents ?? 0;
    const freeThreshold = zone.freeDeliveryThresholdCents ?? 0;
    const feeEn =
      freeThreshold > 0
        ? `Delivery fee ${(feeCents / 100).toFixed(2)} (free over ${(freeThreshold / 100).toFixed(2)})`
        : `Delivery fee ${(feeCents / 100).toFixed(2)}`;
    const feeAr =
      freeThreshold > 0
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
}
