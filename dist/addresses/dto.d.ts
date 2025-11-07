export declare class CreateAddressDto {
    label: string;
    city: string;
    zone?: string;
    street: string;
    building?: string;
    apartment?: string;
    lat?: number;
    lng?: number;
}
declare const UpdateAddressDto_base: import("@nestjs/common").Type<Partial<CreateAddressDto>>;
export declare class UpdateAddressDto extends UpdateAddressDto_base {
}
export {};
