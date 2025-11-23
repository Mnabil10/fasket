import { DeliveryDriversService } from '../delivery-drivers/delivery-drivers.service';
import { UpdateDriverDto, UpdateDriverStatusDto, UpsertVehicleDto } from '../delivery-drivers/dto/driver.dto';
import { UploadsService } from 'src/uploads/uploads.service';
export declare class AdminDeliveryDriversController {
    private readonly drivers;
    private readonly uploads;
    constructor(drivers: DeliveryDriversService, uploads: UploadsService);
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
    create(body: any, files: {
        nationalIdImage?: Express.Multer.File[];
        'vehicle.licenseImage'?: Express.Multer.File[];
        vehicleLicenseImage?: Express.Multer.File[];
    }): Promise<({
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
    upsertVehicle(id: string, dto: UpsertVehicleDto): Promise<({
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
    private normalizeCreatePayload;
    private extractVehicle;
    private pickFirst;
    private ensureFileAllowed;
    private validateCreateDto;
}
