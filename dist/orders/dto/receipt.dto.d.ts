import { OrderStatus } from '@prisma/client';
export declare class OrderReceiptDto {
    orderId: string;
    createdAt: Date;
    status: OrderStatus;
    customer: {
        id: string;
        name: string;
        phone: string;
    };
    address: {
        label?: string;
        street?: string;
        city?: string;
        region?: string;
        zoneId?: string;
        zoneName?: string;
    };
    driver?: {
        id: string;
        fullName: string;
        phone: string;
    };
    items: {
        productId: string;
        productName: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
    }[];
    subtotalCents: number;
    couponDiscountCents: number;
    loyaltyDiscountCents: number;
    shippingFeeCents: number;
    totalCents: number;
    loyaltyPointsUsed: number;
    loyaltyPointsEarned: number;
    currency: string;
}
