export declare enum AdminOrderStatusDto {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
    CANCELED = "CANCELED"
}
export declare class UpdateOrderStatusDto {
    to: AdminOrderStatusDto;
    note?: string;
    actorId?: string;
}
