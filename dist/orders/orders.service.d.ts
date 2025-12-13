import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheService } from '../common/cache/cache.service';
import { AutomationEventsService, AutomationEventRef } from '../automation/automation-events.service';
type PublicStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export declare class OrdersService {
    private readonly prisma;
    private readonly settings;
    private readonly loyalty;
    private readonly audit;
    private readonly cache;
    private readonly automation;
    private readonly logger;
    private readonly listTtl;
    private readonly receiptTtl;
    constructor(prisma: PrismaService, settings: SettingsService, loyalty: LoyaltyService, audit: AuditLogService, cache: CacheService, automation: AutomationEventsService);
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
        etag: string;
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
        etag: string;
    }>;
    awardLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number>;
    revokeLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number>;
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
    clearCachesForOrder(orderId: string, userId?: string): Promise<void>;
    private generateOrderCode;
    reorder(userId: string, fromOrderId: string): Promise<{
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
        etag: string;
    }>;
    cancelOrder(userId: string, orderId: string): Promise<{
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
        etag: string;
    }>;
    updateStatus(orderId: string, nextStatus: OrderStatus, actorId?: string, note?: string): Promise<{
        success: boolean;
    } | {
        success: boolean;
        loyaltyEarned: number;
    }>;
    adminCancelOrder(orderId: string, actorId?: string, note?: string): Promise<{
        success: boolean;
    }>;
    private restockInventory;
    private refundRedeemedPoints;
    private rollbackStockFromCart;
    private rollbackStockForOrderItems;
    private mapStatusToAutomationEvent;
    private emitStatusChanged;
    emitOrderStatusAutomationEvent(tx: Prisma.TransactionClient, orderId: string, status: OrderStatus, dedupeKey: string): Promise<AutomationEventRef | null>;
    private buildOrderEventPayload;
    private toPublicStatus;
    private toOrderDetail;
}
export {};
