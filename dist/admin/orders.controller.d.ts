import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class AdminOrdersController {
    private svc;
    private readonly logger;
    constructor(svc: AdminService);
    list(status?: string, from?: string, to?: string, customer?: string, minTotalCents?: string, maxTotalCents?: string, page?: PaginationDto): Promise<{
        items: ({
            user: {
                id: string;
                phone: string;
                name: string;
            };
        } & {
            status: import(".prisma/client").$Enums.OrderStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            totalCents: number;
            subtotalCents: number;
            shippingFeeCents: number;
            discountCents: number;
            cartId: string | null;
            addressId: string | null;
            paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
            couponCode: string | null;
            notes: string | null;
        })[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    one(id: string): import(".prisma/client").Prisma.Prisma__OrderClient<({
        items: {
            id: string;
            orderId: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
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
            userId: string;
            label: string;
            city: string;
            zone: string | null;
            street: string;
            building: string | null;
            apartment: string | null;
            lat: number | null;
            lng: number | null;
        } | null;
        statusHistory: {
            id: string;
            createdAt: Date;
            orderId: string;
            note: string | null;
            actorId: string | null;
            from: import(".prisma/client").$Enums.OrderStatus | null;
            to: import(".prisma/client").$Enums.OrderStatus;
        }[];
    } & {
        status: import(".prisma/client").$Enums.OrderStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        totalCents: number;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        cartId: string | null;
        addressId: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        couponCode: string | null;
        notes: string | null;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    updateStatus(user: CurrentUserPayload, id: string, dto: UpdateOrderStatusDto): Promise<{
        ok: boolean;
        message: string;
    } | {
        ok: boolean;
        message?: undefined;
    }>;
}
