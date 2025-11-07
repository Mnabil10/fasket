import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class OrdersService {
    private prisma;
    private notify;
    constructor(prisma: PrismaService, notify: NotificationsService);
    list(userId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        totalCents: number;
    }[]>;
    detail(userId: string, id: string): import(".prisma/client").Prisma.Prisma__OrderClient<({
        address: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            label: string;
            city: string;
            zone: string | null;
            street: string;
            building: string | null;
            apartment: string | null;
            lat: number | null;
            lng: number | null;
            userId: string;
        } | null;
        items: {
            id: string;
            orderId: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.OrderStatus;
        cartId: string | null;
        addressId: string | null;
        notes: string | null;
        couponCode: string | null;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    create(userId: string, payload: {
        addressId: string;
        paymentMethod: 'COD' | 'CARD';
        cartId?: string;
        items?: {
            productId: string;
            qty: number;
        }[];
        notes?: string;
        couponCode?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.OrderStatus;
        cartId: string | null;
        addressId: string | null;
        notes: string | null;
        couponCode: string | null;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
    }>;
}
