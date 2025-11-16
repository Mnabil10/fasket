import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class AddressesController {
    private service;
    constructor(service: AddressesService);
    list(user: CurrentUserPayload): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
    }[]>;
    create(user: CurrentUserPayload, dto: CreateAddressDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
    }>;
    update(user: CurrentUserPayload, id: string, dto: UpdateAddressDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
    }>;
    remove(user: CurrentUserPayload, id: string): Promise<{
        ok: boolean;
    }>;
}
