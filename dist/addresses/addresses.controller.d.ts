import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class AddressesController {
    private service;
    constructor(service: AddressesService);
    list(user: CurrentUserPayload): Promise<{
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
    create(user: CurrentUserPayload, dto: CreateAddressDto): Promise<{
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
    update(user: CurrentUserPayload, id: string, dto: UpdateAddressDto): Promise<{
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
    remove(user: CurrentUserPayload, id: string): Promise<{
        ok: boolean;
    }>;
}
