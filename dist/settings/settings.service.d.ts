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
    constructor(prisma: PrismaService, cache: CacheService);
    getSettings(): Promise<Setting>;
    clearCache(): Promise<void>;
    refresh(): Promise<Setting>;
    getDeliveryZones(): Promise<DeliveryZone[]>;
    getActiveDeliveryZones(): Promise<DeliveryZone[]>;
    getZoneById(zoneId: string, options?: {
        includeInactive?: boolean;
    }): Promise<DeliveryZone | undefined>;
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
