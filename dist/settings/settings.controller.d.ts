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
        delivery: import("./settings.types").DeliveryConfig;
        loyalty: import("./settings.types").LoyaltyConfig;
        payment: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
        notifications: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
        businessHours: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
    }>;
}
