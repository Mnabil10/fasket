import { Coupon } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyCouponDto } from './dto';
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
    private prisma;
    constructor(prisma: PrismaService);
    private ensureCart;
    get(userId: string, lang?: Lang): Promise<{
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
    }>;
    add(userId: string, dto: {
        productId: string;
        qty: number;
    }, lang?: Lang): Promise<{
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
    }>;
    updateQty(userId: string, id: string, qty: number, lang?: Lang): Promise<{
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
    }>;
    remove(userId: string, id: string, lang?: Lang): Promise<{
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
    }>;
    applyCoupon(userId: string, dto: ApplyCouponDto, lang?: Lang): Promise<{
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
    }>;
    private loadCartSnapshot;
    private buildCartResponse;
    private calculateShippingFee;
    private resolveCouponDiscount;
    private validateCoupon;
    private calculateCouponDiscount;
    private formatCouponValidationMessage;
    private serializeCoupon;
    private clearCartCoupon;
}
export {};
