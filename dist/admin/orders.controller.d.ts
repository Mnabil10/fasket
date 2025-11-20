import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { DeliveryDriversService } from '../delivery-drivers/delivery-drivers.service';
import { AssignDriverDto } from '../delivery-drivers/dto/driver.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptService } from '../orders/receipt.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditLogService } from '../common/audit/audit-log.service';
export declare class AdminOrdersController {
    private readonly svc;
    private readonly drivers;
    private readonly notifications;
    private readonly receipts;
    private readonly loyalty;
    private readonly audit;
    private readonly logger;
    constructor(svc: AdminService, drivers: DeliveryDriversService, notifications: NotificationsService, receipts: ReceiptService, loyalty: LoyaltyService, audit: AuditLogService);
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
            deliveryEtaMinutes: number | null;
            subtotalCents: number;
            shippingFeeCents: number;
            discountCents: number;
            loyaltyDiscountCents: number;
            loyaltyPointsUsed: number;
            loyaltyPointsEarned: number;
            notes: string | null;
            couponCode: string | null;
            deliveryZoneId: string | null;
            deliveryZoneName: string | null;
            estimatedDeliveryTime: string | null;
            paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
            driverAssignedAt: Date | null;
            cartId: string | null;
            addressId: string | null;
            driverId: string | null;
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
            loyaltyPoints: number;
            twoFaEnabled: boolean;
            twoFaSecret: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        address: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            zoneId: string;
            label: string | null;
            city: string | null;
            street: string | null;
            building: string | null;
            apartment: string | null;
            notes: string | null;
            lat: number | null;
            lng: number | null;
            isDefault: boolean;
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
        deliveryEtaMinutes: number | null;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        loyaltyDiscountCents: number;
        loyaltyPointsUsed: number;
        loyaltyPointsEarned: number;
        notes: string | null;
        couponCode: string | null;
        deliveryZoneId: string | null;
        deliveryZoneName: string | null;
        estimatedDeliveryTime: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        driverAssignedAt: Date | null;
        cartId: string | null;
        addressId: string | null;
        driverId: string | null;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    getReceipt(id: string): Promise<import("../orders/dto/receipt.dto").OrderReceiptDto>;
    updateStatus(user: CurrentUserPayload, id: string, dto: UpdateOrderStatusDto): Promise<{
        ok: boolean;
        message: string;
    } | {
        ok: boolean;
        message?: undefined;
    }>;
    assignDriver(id: string, dto: AssignDriverDto): Promise<{
        ok: boolean;
    }>;
}
