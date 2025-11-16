import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class OrdersController {
    private service;
    constructor(service: OrdersService);
    list(user: CurrentUserPayload): Promise<{
        id: string;
        totalCents: number;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
        createdAt: Date;
    }[]>;
    detail(user: CurrentUserPayload, id: string): Promise<{
        id: string;
        userId: string;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        address: {
            id: string;
            label: string;
            city: string;
            zone: string | null;
            street: string;
            building: string | null;
            apartment: string | null;
        } | null;
        items: {
            id: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
    }>;
    create(user: CurrentUserPayload, dto: CreateOrderDto): Promise<{
        id: string;
        userId: string;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        address: {
            id: string;
            label: string;
            city: string;
            zone: string | null;
            street: string;
            building: string | null;
            apartment: string | null;
        } | null;
        items: {
            id: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
    }>;
}
