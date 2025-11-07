import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
export declare class AddressesController {
    private service;
    constructor(service: AddressesService);
    list(user: any): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
        userId: string;
    }[]>;
    create(user: any, dto: CreateAddressDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
        userId: string;
    }>;
    update(user: any, id: string, dto: UpdateAddressDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        label: string;
        city: string;
        zone: string | null;
        street: string;
        building: string | null;
        apartment: string | null;
        lat: number | null;
        lng: number | null;
        userId: string;
    }>;
    remove(user: any, id: string): Promise<{
        ok: boolean;
    }>;
}
