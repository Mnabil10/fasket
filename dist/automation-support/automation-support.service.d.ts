import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AutomationEventsService } from '../automation/automation-events.service';
export declare class AutomationSupportService {
    private readonly prisma;
    private readonly settings;
    private readonly automation;
    private readonly cache;
    private readonly phoneRegex;
    private readonly rateLimitTtl;
    private readonly rateLimitPerPhone;
    private readonly rateLimitPerIp;
    constructor(prisma: PrismaService, settings: SettingsService, automation: AutomationEventsService, cache: Cache);
    orderStatusLookup(params: {
        phone: string;
        orderCode?: string;
        last4?: string;
        ip?: string;
        correlationId?: string;
    }): Promise<{
        orders: {
            orderCode: any;
            status: string;
            etaMinutes: any;
            itemsSummary: any;
            totalFormatted: string;
            createdAt: any;
            driver: {
                name: any;
                phoneMasked: string;
            } | null;
        }[];
    }>;
    productSearch(q: string, ip?: string): Promise<{
        items: {
            id: string;
            sku: string | null;
            name: string;
            priceCents: number;
            available: boolean;
        }[];
    }>;
    deliveryZones(): Promise<{
        id: string;
        name: string;
    }[]>;
    private normalizePhone;
    private normalizePhoneSafe;
    private maskPhone;
    private toPublicStatus;
    private auditSupport;
    private bumpOrThrow;
}
