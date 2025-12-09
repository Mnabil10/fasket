import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ReceiptService } from './receipt.service';
import { Response } from 'express';
export declare class OrdersController {
    private readonly service;
    private readonly receipts;
    constructor(service: OrdersService, receipts: ReceiptService);
    list(user: CurrentUserPayload): Promise<{
        id: string;
        code: string;
        totalCents: number;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
        createdAt: Date;
        loyaltyPointsUsed: number;
        loyaltyDiscountCents: number;
        loyaltyPointsEarned: number;
    }[]>;
    detail(user: CurrentUserPayload, id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    create(user: CurrentUserPayload, dto: CreateOrderDto): Promise<{
        id: string;
        code: string;
        userId: string;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
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
    reorder(user: CurrentUserPayload, id: string): Promise<{
        id: string;
        code: string;
        userId: string;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
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
    receipt(user: CurrentUserPayload, id: string): Promise<import("./dto/receipt.dto").OrderReceiptDto>;
    cancel(user: CurrentUserPayload, id: string): Promise<{
        id: string;
        code: string;
        userId: string;
        status: "PENDING" | "CANCELED" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
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
}
