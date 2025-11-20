import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
export declare class AddressesService {
    private readonly prisma;
    private readonly settings;
    constructor(prisma: PrismaService, settings: SettingsService);
    list(userId: string): Promise<{
        deliveryZone: import("../settings/settings.types").DeliveryZone | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        zoneId: string;
        label: string | null;
        city: string | null;
        street: string | null;
        building: string | null;
        apartment: string | null;
        notes: string | null;
        lat: number | null;
        lng: number | null;
        isDefault: boolean;
    }[]>;
    create(userId: string, dto: CreateAddressDto): Promise<{
        deliveryZone: import("../settings/settings.types").DeliveryZone | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        zoneId: string;
        label: string | null;
        city: string | null;
        street: string | null;
        building: string | null;
        apartment: string | null;
        notes: string | null;
        lat: number | null;
        lng: number | null;
        isDefault: boolean;
    }>;
    update(userId: string, id: string, dto: UpdateAddressDto): Promise<{
        deliveryZone: import("../settings/settings.types").DeliveryZone | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        zoneId: string;
        label: string | null;
        city: string | null;
        street: string | null;
        building: string | null;
        apartment: string | null;
        notes: string | null;
        lat: number | null;
        lng: number | null;
        isDefault: boolean;
    }>;
    remove(userId: string, id: string): Promise<{
        ok: boolean;
    }>;
    private attachZoneMetadata;
}
