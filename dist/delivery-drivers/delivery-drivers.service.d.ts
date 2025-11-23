import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto, UpdateDriverDto, UpdateDriverStatusDto, UpsertVehicleDto } from './dto/driver.dto';
export declare class DeliveryDriversService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(params?: {
        search?: string;
        isActive?: boolean;
        page?: number | string;
        pageSize?: number | string;
        limit?: number | string;
    }): Promise<{
        items: ({
            vehicle: {
                type: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                driverId: string;
                plateNumber: string;
                licenseImageUrl: string | null;
                color: string | null;
            } | null;
        } & {
            id: string;
            phone: string;
            createdAt: Date;
            updatedAt: Date;
            isActive: boolean;
            fullName: string;
            nationalId: string;
            nationalIdImageUrl: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    getById(id: string): Promise<{
        vehicle: {
            type: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            driverId: string;
            plateNumber: string;
            licenseImageUrl: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }>;
    create(dto: CreateDriverDto): Promise<({
        vehicle: {
            type: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            driverId: string;
            plateNumber: string;
            licenseImageUrl: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }) | null>;
    update(id: string, dto: UpdateDriverDto): Promise<{
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }>;
    updateStatus(id: string, dto: UpdateDriverStatusDto): Promise<{
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }>;
    upsertVehicle(driverId: string, dto: UpsertVehicleDto): Promise<({
        vehicle: {
            type: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            driverId: string;
            plateNumber: string;
            licenseImageUrl: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }) | null>;
    assignDriverToOrder(orderId: string, driverId: string): Promise<{
        order: {
            status: import(".prisma/client").$Enums.OrderStatus;
            id: string;
            userId: string;
            driverAssignedAt: Date | null;
            driverId: string | null;
        };
        driver: {
            id: string;
            phone: string;
            isActive: boolean;
            fullName: string;
        };
    }>;
    private ensureDriver;
}
