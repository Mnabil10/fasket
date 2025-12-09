import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settings;
    constructor(settings: SettingsService);
    getActiveDeliveryZones(): Promise<import("./settings.types").DeliveryZone[]>;
    getAppSettings(): Promise<{
        store: {
            name: string;
            nameAr: string | undefined;
            description: string | undefined;
            descriptionAr: string | undefined;
            contactEmail: string | undefined;
            contactPhone: string | undefined;
            address: string | undefined;
            currency: string;
            timezone: string;
            language: string;
            maintenanceMode: boolean;
        };
        delivery: {
            deliveryZones: {
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
                id: string;
                nameEn: string;
                nameAr: string;
                city?: string;
                region?: string;
                feeCents: number;
                etaMinutes?: number;
                freeDeliveryThresholdCents?: number;
                minOrderAmountCents?: number;
                isActive: boolean;
            }[];
            deliveryFeeCents: number;
            freeDeliveryMinimumCents: number;
            estimatedDeliveryTime?: string | null;
            maxDeliveryRadiusKm?: number | null;
        };
        loyalty: import("./settings.types").LoyaltyConfig;
        payment: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
        notifications: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
        businessHours: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
    }>;
}
