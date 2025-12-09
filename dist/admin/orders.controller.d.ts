import { Prisma } from '@prisma/client';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { AssignDriverDto } from '../delivery-drivers/dto/driver.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptService } from '../orders/receipt.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { OrdersService } from '../orders/orders.service';
import { AdminOrderListDto } from './dto/admin-order-list.dto';
export declare class AdminOrdersController {
    private readonly svc;
    private readonly notifications;
    private readonly receipts;
    private readonly audit;
    private readonly orders;
    private readonly logger;
    constructor(svc: AdminService, notifications: NotificationsService, receipts: ReceiptService, audit: AuditLogService, orders: OrdersService);
    list(query: AdminOrderListDto): Promise<{
        items: ({
            user: {
                id: string;
                phone: string;
                name: string;
            };
            driver: {
                id: string;
                phone: string;
                fullName: string;
            } | null;
        } & {
            status: import(".prisma/client").$Enums.OrderStatus;
            code: string;
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
            idempotencyKey: string | null;
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
    one(id: string): Prisma.Prisma__OrderClient<({
        items: {
            id: string;
            orderId: string;
            qty: number;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
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
        driver: {
            id: string;
            phone: string;
            fullName: string;
            vehicle: {
                type: string;
                plateNumber: string;
            } | null;
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
        code: string;
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
        idempotencyKey: string | null;
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
        success: boolean;
    }>;
    assignDriver(id: string, dto: AssignDriverDto, admin: CurrentUserPayload): Promise<{
        success: boolean;
        data: {
            orderId: string;
            driverAssignedAt: Date | null;
            driver: {
                id: string;
                fullName: string;
                phone: string;
                vehicleType: string | undefined;
                plateNumber: string | undefined;
            };
        };
    }>;
}
