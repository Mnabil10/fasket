import { DeliveryDriversService } from '../delivery-drivers/delivery-drivers.service';
import { CreateDriverDto, UpdateDriverDto, UpdateDriverStatusDto, UpsertVehicleDto } from '../delivery-drivers/dto/driver.dto';
export declare class AdminDeliveryDriversController {
    private readonly drivers;
    constructor(drivers: DeliveryDriversService);
    list(search?: string, isActive?: string, page?: number, pageSize?: number): Promise<{
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
    get(id: string): Promise<{
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
    create(dto: CreateDriverDto): import(".prisma/client").Prisma.Prisma__DeliveryDriverClient<{
        id: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        fullName: string;
        nationalId: string;
        nationalIdImageUrl: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
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
    upsertVehicle(id: string, dto: UpsertVehicleDto): Promise<{
        type: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        driverId: string;
        plateNumber: string;
        licenseImageUrl: string | null;
        color: string | null;
    }>;
}
