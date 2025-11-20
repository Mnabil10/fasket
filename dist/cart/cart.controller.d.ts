import { CartService } from './cart.service';
import { AddToCartDto, ApplyCouponDto, UpdateCartItemDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class CartController {
    private service;
    constructor(service: CartService);
    get(user: CurrentUserPayload, lang?: 'en' | 'ar', addressId?: string): Promise<{
        cartId: string;
        items: {
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
        }[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: {
            code: string;
            type: import(".prisma/client").Coupon["type"];
            valueCents: number;
            maxDiscountCents: number | null;
            minOrderCents: number | null;
            startsAt: Date | null;
            endsAt: Date | null;
        } | null;
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
        };
    }>;
    add(user: CurrentUserPayload, dto: AddToCartDto, lang?: 'en' | 'ar', addressId?: string): Promise<{
        cartId: string;
        items: {
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
        }[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: {
            code: string;
            type: import(".prisma/client").Coupon["type"];
            valueCents: number;
            maxDiscountCents: number | null;
            minOrderCents: number | null;
            startsAt: Date | null;
            endsAt: Date | null;
        } | null;
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
        };
    }>;
    applyCoupon(user: CurrentUserPayload, dto: ApplyCouponDto, lang?: 'en' | 'ar', addressId?: string): Promise<{
        cartId: string;
        items: {
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
        }[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: {
            code: string;
            type: import(".prisma/client").Coupon["type"];
            valueCents: number;
            maxDiscountCents: number | null;
            minOrderCents: number | null;
            startsAt: Date | null;
            endsAt: Date | null;
        } | null;
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
        };
    }>;
    update(user: CurrentUserPayload, id: string, dto: UpdateCartItemDto, lang?: 'en' | 'ar', addressId?: string): Promise<{
        cartId: string;
        items: {
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
        }[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: {
            code: string;
            type: import(".prisma/client").Coupon["type"];
            valueCents: number;
            maxDiscountCents: number | null;
            minOrderCents: number | null;
            startsAt: Date | null;
            endsAt: Date | null;
        } | null;
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
        };
    }>;
    remove(user: CurrentUserPayload, id: string, lang?: 'en' | 'ar', addressId?: string): Promise<{
        cartId: string;
        items: {
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
        }[];
        subtotalCents: number;
        shippingFeeCents: number;
        discountCents: number;
        totalCents: number;
        coupon: {
            code: string;
            type: import(".prisma/client").Coupon["type"];
            valueCents: number;
            maxDiscountCents: number | null;
            minOrderCents: number | null;
            startsAt: Date | null;
            endsAt: Date | null;
        } | null;
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
        };
    }>;
}
