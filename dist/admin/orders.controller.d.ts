import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { PaginationDto } from './dto/pagination.dto';
export declare class AdminOrdersController {
    private svc;
    constructor(svc: AdminService);
    list(status?: string, from?: string, to?: string, customer?: string, minTotalCents?: string, maxTotalCents?: string, page?: PaginationDto): Promise<{
        items: ({
            user: {
                id: string;
                phone: string;
                name: string;
            };
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
        })[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    one(id: string): import(".prisma/client").Prisma.Prisma__OrderClient<({
        user: {
            id: string;
            email: string | null;
            phone: string;
            password: string;
            role: import(".prisma/client").$Enums.UserRole;
            name: string;
            createdAt: Date;
            updatedAt: Date;
        };
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
        statusHistory: {
            id: string;
            createdAt: Date;
            orderId: string;
            to: import(".prisma/client").$Enums.OrderStatus;
            note: string | null;
            actorId: string | null;
            from: import(".prisma/client").$Enums.OrderStatus | null;
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
    updateStatus(user: any, id: string, dto: UpdateOrderStatusDto): Promise<{
        ok: boolean;
        message: string;
    } | {
        ok: boolean;
        message?: undefined;
    }>;
}
