export declare class CreateAddressDto {
    zoneId: string;
    label?: string;
    city?: string;
    street?: string;
    building?: string;
    apartment?: string;
    notes?: string;
    isDefault?: boolean;
    lat?: number;
    lng?: number;
}
declare const UpdateAddressDto_base: import("@nestjs/common").Type<Partial<CreateAddressDto>>;
export declare class UpdateAddressDto extends UpdateAddressDto_base {
}
export {};
