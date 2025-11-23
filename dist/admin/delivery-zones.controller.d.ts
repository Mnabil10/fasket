import { SettingsService } from '../settings/settings.service';
import { CreateDeliveryZoneDto, UpdateDeliveryZoneDto, ListDeliveryZonesQueryDto } from './dto/delivery-zone.dto';
export declare class AdminDeliveryZonesController {
    private readonly settings;
    constructor(settings: SettingsService);
    list(query: ListDeliveryZonesQueryDto): Promise<{
        items: import("../settings/settings.types").DeliveryZone[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<import("../settings/settings.types").DeliveryZone>;
    create(dto: CreateDeliveryZoneDto): Promise<import("../settings/settings.types").DeliveryZone>;
    update(id: string, dto: UpdateDeliveryZoneDto): Promise<import("../settings/settings.types").DeliveryZone>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
}
