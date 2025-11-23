export declare class UpsertVehicleDto {
    type: string;
    plateNumber: string;
    licenseImageUrl?: string;
    color?: string;
}
export declare class CreateDriverDto {
    fullName: string;
    phone: string;
    nationalId: string;
    nationalIdImageUrl?: string;
    isActive?: boolean;
    vehicle?: UpsertVehicleDto;
}
declare const UpdateDriverDto_base: import("@nestjs/common").Type<Partial<CreateDriverDto>>;
export declare class UpdateDriverDto extends UpdateDriverDto_base {
}
export declare class UpdateDriverStatusDto {
    isActive: boolean;
}
export declare class AssignDriverDto {
    driverId: string;
}
export {};
