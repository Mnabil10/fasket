import { Coupon } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyCouponDto } from './dto';
import { SettingsService } from '../settings/settings.service';
type Lang = 'en' | 'ar' | undefined;
type CartItemResponse = {
    id: string;
    cartId: string;
    productId: string;
    qty: number;
    priceCents: number;
    product: {
        id: string;
        name: string;
        nameAr?: string | null;
        imageUrl: string | null;
        priceCents: number;
        salePriceCents?: number | null;
    };
};
type SerializedCoupon = {
    code: string;
    type: Coupon['type'];
    valueCents: number;
    maxDiscountCents: number | null;
    minOrderCents: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
};
export declare class CartService {
    private readonly prisma;
    private readonly settings;
    constructor(prisma: PrismaService, settings: SettingsService);
    private ensureCart;
    get(userId: string, lang?: Lang, addressId?: string): Promise<{
        cartId: string;
        items: CartItemResponse[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: SerializedCoupon | null;
        couponNotice: {
            code: string;
            requiredSubtotalCents: number;
            shortfallCents: number;
        } | undefined;
        delivery: {
            addressId: string | null;
            zoneId: string | null;
            zoneName: string | null;
            estimatedDeliveryTime: string | null;
            etaMinutes: number | null;
            minOrderAmountCents: number | null;
            minOrderShortfallCents: number;
            freeDeliveryThresholdCents: number | null;
            etaText: string | null;
            feeMessageEn: string | undefined;
            feeMessageAr: string | undefined;
        };
    }>;
    add(userId: string, dto: {
        productId: string;
        qty: number;
    }, lang?: Lang, addressId?: string): Promise<{
        cartId: string;
        items: CartItemResponse[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: SerializedCoupon | null;
        couponNotice: {
            code: string;
            requiredSubtotalCents: number;
            shortfallCents: number;
        } | undefined;
        delivery: {
            addressId: string | null;
            zoneId: string | null;
            zoneName: string | null;
            estimatedDeliveryTime: string | null;
            etaMinutes: number | null;
            minOrderAmountCents: number | null;
            minOrderShortfallCents: number;
            freeDeliveryThresholdCents: number | null;
            etaText: string | null;
            feeMessageEn: string | undefined;
            feeMessageAr: string | undefined;
        };
    }>;
    updateQty(userId: string, id: string, qty: number, lang?: Lang, addressId?: string): Promise<{
        cartId: string;
        items: CartItemResponse[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: SerializedCoupon | null;
        couponNotice: {
            code: string;
            requiredSubtotalCents: number;
            shortfallCents: number;
        } | undefined;
        delivery: {
            addressId: string | null;
            zoneId: string | null;
            zoneName: string | null;
            estimatedDeliveryTime: string | null;
            etaMinutes: number | null;
            minOrderAmountCents: number | null;
            minOrderShortfallCents: number;
            freeDeliveryThresholdCents: number | null;
            etaText: string | null;
            feeMessageEn: string | undefined;
            feeMessageAr: string | undefined;
        };
    }>;
    remove(userId: string, id: string, lang?: Lang, addressId?: string): Promise<{
        cartId: string;
        items: CartItemResponse[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: SerializedCoupon | null;
        couponNotice: {
            code: string;
            requiredSubtotalCents: number;
            shortfallCents: number;
        } | undefined;
        delivery: {
            addressId: string | null;
            zoneId: string | null;
            zoneName: string | null;
            estimatedDeliveryTime: string | null;
            etaMinutes: number | null;
            minOrderAmountCents: number | null;
            minOrderShortfallCents: number;
            freeDeliveryThresholdCents: number | null;
            etaText: string | null;
            feeMessageEn: string | undefined;
            feeMessageAr: string | undefined;
        };
    }>;
    applyCoupon(userId: string, dto: ApplyCouponDto, lang?: Lang, addressId?: string): Promise<{
        cartId: string;
        items: CartItemResponse[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: SerializedCoupon | null;
        couponNotice: {
            code: string;
            requiredSubtotalCents: number;
            shortfallCents: number;
        } | undefined;
        delivery: {
            addressId: string | null;
            zoneId: string | null;
            zoneName: string | null;
            estimatedDeliveryTime: string | null;
            etaMinutes: number | null;
            minOrderAmountCents: number | null;
            minOrderShortfallCents: number;
            freeDeliveryThresholdCents: number | null;
            etaText: string | null;
            feeMessageEn: string | undefined;
            feeMessageAr: string | undefined;
        };
    }>;
    private loadCartSnapshot;
    private resolveDeliveryAddress;
    private buildCartResponse;
    private resolveCouponDiscount;
    private validateCoupon;
    private calculateCouponDiscount;
    private formatCouponValidationMessage;
    private serializeCoupon;
    private clearCartCoupon;
}
export {};
