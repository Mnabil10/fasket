export declare enum PaymentMethodDto {
    COD = "COD",
    CARD = "CARD"
}
export declare class CreateOrderDto {
    addressId: string;
    paymentMethod: PaymentMethodDto;
    note?: string;
    couponCode?: string;
    loyaltyPointsToRedeem?: number;
}
