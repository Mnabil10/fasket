import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditLogService } from '../common/audit/audit-log.service';
type PublicStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export declare class OrdersService {
    private readonly prisma;
    private readonly notify;
    private readonly settings;
    private readonly loyalty;
    private readonly audit;
    private readonly logger;
    constructor(prisma: PrismaService, notify: NotificationsService, settings: SettingsService, loyalty: LoyaltyService, audit: AuditLogService);
    list(userId: string): Promise<{
        id: string;
        code: string;
        totalCents: number;
        status: PublicStatus;
        createdAt: Date;
        loyaltyPointsUsed: number;
        loyaltyDiscountCents: number;
        loyaltyPointsEarned: number;
    }[]>;
    detail(userId: string, id: string): Promise<{
        id: string;
        code: string;
        userId: string;
        status: PublicStatus;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        loyaltyDiscountCents: number;
        loyaltyPointsUsed: number;
        loyaltyPointsEarned: any;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        estimatedDeliveryTime: string | undefined;
        deliveryEtaMinutes: number | undefined;
        deliveryZoneId: string | undefined;
        deliveryZoneName: string | undefined;
        deliveryZone: {
            id: any;
            nameEn: any;
            nameAr: any;
            city: any;
            region: any;
            feeCents: any;
            etaMinutes: any;
            isActive: any;
            freeDeliveryThresholdCents: any;
            minOrderAmountCents: any;
        } | undefined;
        address: {
            id: string;
            label: string | null;
            city: string | null;
            zoneId: string;
            street: string | null;
            building: string | null;
            apartment: string | null;
        } | null;
        driver: {
            id: string;
            fullName: string;
            phone: string;
        } | null;
        items: {
            id: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
    }>;
    create(userId: string, payload: CreateOrderDto): Promise<{
        id: string;
        code: string;
        userId: string;
        status: PublicStatus;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        loyaltyDiscountCents: number;
        loyaltyPointsUsed: number;
        loyaltyPointsEarned: any;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        estimatedDeliveryTime: string | undefined;
        deliveryEtaMinutes: number | undefined;
        deliveryZoneId: string | undefined;
        deliveryZoneName: string | undefined;
        deliveryZone: {
            id: any;
            nameEn: any;
            nameAr: any;
            city: any;
            region: any;
            feeCents: any;
            etaMinutes: any;
            isActive: any;
            freeDeliveryThresholdCents: any;
            minOrderAmountCents: any;
        } | undefined;
        address: {
            id: string;
            label: string | null;
            city: string | null;
            zoneId: string;
            street: string | null;
            building: string | null;
            apartment: string | null;
        } | null;
        driver: {
            id: string;
            fullName: string;
            phone: string;
        } | null;
        items: {
            id: string;
            productId: string;
            productNameSnapshot: string;
            priceSnapshotCents: number;
            qty: number;
        }[];
    }>;
    awardLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number>;
    assignDriverToOrder(orderId: string, driverId: string, actorId?: string): Promise<{
        orderId: string;
        driverAssignedAt: Date | null;
        driver: {
            id: string;
            fullName: string;
            phone: string;
            vehicleType: string | undefined;
            plateNumber: string | undefined;
        };
    }>;
    private generateOrderCode;
    private toPublicStatus;
    private toOrderDetail;
}
export {};
