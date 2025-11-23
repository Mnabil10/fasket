import { PaginationDto } from './pagination.dto';
export declare class CreateDeliveryZoneDto {
    nameEn: string;
    nameAr?: string;
    city?: string;
    region?: string;
    feeCents: number;
    etaMinutes?: number;
    freeDeliveryThresholdCents?: number | null;
    minOrderAmountCents?: number | null;
    isActive?: boolean;
}
declare const UpdateDeliveryZoneDto_base: import("@nestjs/common").Type<Partial<CreateDeliveryZoneDto>>;
export declare class UpdateDeliveryZoneDto extends UpdateDeliveryZoneDto_base {
}
export declare class ListDeliveryZonesQueryDto extends PaginationDto {
    search?: string;
    isActive?: boolean;
}
export {};
