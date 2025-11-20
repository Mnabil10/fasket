import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settings;
    constructor(settings: SettingsService);
    getActiveDeliveryZones(): Promise<import("./settings.types").DeliveryZone[]>;
}
