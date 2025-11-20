import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
type PublicStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export declare class OrdersService {
    private readonly prisma;
    private readonly notify;
    private readonly settings;
    private readonly loyalty;
    private readonly logger;
    constructor(prisma: PrismaService, notify: NotificationsService, settings: SettingsService, loyalty: LoyaltyService);
    list(userId: string): Promise<{
        id: string;
        totalCents: number;
        status: PublicStatus;
        createdAt: Date;
    }[]>;
    detail(userId: string, id: string): Promise<{
        id: string;
        userId: string;
        status: PublicStatus;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        loyaltyDiscountCents: number;
        loyaltyPointsUsed: number;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        estimatedDeliveryTime: string | undefined;
        deliveryEtaMinutes: number | undefined;
        deliveryZoneId: string | undefined;
        deliveryZoneName: string | undefined;
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
        userId: string;
        status: PublicStatus;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        loyaltyDiscountCents: number;
        loyaltyPointsUsed: number;
        totalCents: number;
        createdAt: Date;
        note: string | undefined;
        estimatedDeliveryTime: string | undefined;
        deliveryEtaMinutes: number | undefined;
        deliveryZoneId: string | undefined;
        deliveryZoneName: string | undefined;
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
    private toPublicStatus;
    private toOrderDetail;
}
export {};
