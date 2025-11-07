export declare enum PaymentMethodDto {
    COD = "COD",
    CARD = "CARD"
}
export declare class CreateOrderDto {
    addressId: string;
    paymentMethod: PaymentMethodDto;
    notes?: string;
    couponCode?: string;
    cartId?: string;
    items?: OrderItemInputDto[];
}
export declare class OrderItemInputDto {
    productId: string;
    qty: number;
}
