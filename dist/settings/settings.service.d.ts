import { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DeliveryConfig, DeliveryQuote, DeliveryZone, LoyaltyConfig } from './settings.types';
export declare class SettingsService {
    private readonly prisma;
    private readonly cache;
    private readonly logger;
    private readonly cacheKey;
    private readonly cacheTtlSec;
    private readonly zonesCacheKey;
    private readonly zonesCacheTtlSec;
    constructor(prisma: PrismaService, cache: CacheService);
    getSettings(): Promise<Setting>;
    clearCache(): Promise<void>;
    refresh(): Promise<Setting>;
    getDeliveryZones(options?: {
        includeInactive?: boolean;
    }): Promise<DeliveryZone[]>;
    getActiveDeliveryZones(): Promise<DeliveryZone[]>;
    getZoneById(zoneId: string, options?: {
        includeInactive?: boolean;
    }): Promise<DeliveryZone | undefined>;
    listZones(params?: {
        search?: string;
        isActive?: boolean;
        page?: number;
        pageSize?: number;
    }): Promise<{
        items: DeliveryZone[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    createZone(data: {
        nameEn: string;
        nameAr?: string;
        city?: string;
        region?: string;
        feeCents: number;
        etaMinutes?: number;
        freeDeliveryThresholdCents?: number | null;
        minOrderAmountCents?: number | null;
        isActive?: boolean;
    }): Promise<DeliveryZone>;
    updateZone(id: string, data: {
        nameEn?: string;
        nameAr?: string;
        city?: string;
        region?: string;
        feeCents?: number;
        etaMinutes?: number | null;
        freeDeliveryThresholdCents?: number | null;
        minOrderAmountCents?: number | null;
        isActive?: boolean;
    }): Promise<DeliveryZone>;
    deleteZone(id: string): Promise<{
        success: boolean;
    }>;
    replaceZones(zones: DeliveryZone[]): Promise<DeliveryZone[]>;
    getDeliveryConfig(): Promise<DeliveryConfig>;
    computeDeliveryQuote(params: {
        subtotalCents: number;
        zoneId?: string | null;
    }): Promise<DeliveryQuote>;
    getLoyaltyConfig(): Promise<LoyaltyConfig>;
    ensureZoneActive(zoneId: string, zones: DeliveryZone[]): DeliveryZone;
    deserializeDeliveryZones(raw: any): DeliveryZone[];
    private normalizeDeliveryZones;
    private normalizeDeliveryZone;
    private toNonNegativeInt;
    private formatEta;
}
