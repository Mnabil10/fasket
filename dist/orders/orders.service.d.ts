import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto';
type PublicStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export declare class OrdersService {
    private prisma;
    private notify;
    private readonly logger;
    constructor(prisma: PrismaService, notify: NotificationsService);
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
    create(userId: string, payload: CreateOrderDto): Promise<{
        id: string;
        userId: string;
        status: PublicStatus;
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
    private toPublicStatus;
    private toOrderDetail;
}
export {};
