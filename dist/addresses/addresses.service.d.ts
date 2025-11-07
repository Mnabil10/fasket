import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
export declare class AddressesService {
    private prisma;
    constructor(prisma: PrismaService);
    list(userId: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    create(userId: string, dto: CreateAddressDto): Promise<{
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
    update(userId: string, id: string, dto: UpdateAddressDto): Promise<{
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
    remove(userId: string, id: string): Promise<{
        ok: boolean;
    }>;
}
