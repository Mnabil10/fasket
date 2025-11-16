import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class CartController {
    private service;
    constructor(service: CartService);
    get(user: CurrentUserPayload, lang?: 'en' | 'ar'): Promise<{
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
                nameAr: string | null;
                imageUrl: string | undefined;
                priceCents: number;
                salePriceCents: number | null;
            };
        }[];
        subtotalCents: number;
    }>;
    add(user: CurrentUserPayload, dto: AddToCartDto, lang?: 'en' | 'ar'): Promise<{
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
                nameAr: string | null;
                imageUrl: string | undefined;
                priceCents: number;
                salePriceCents: number | null;
            };
        }[];
        subtotalCents: number;
    }>;
    update(user: CurrentUserPayload, id: string, dto: UpdateCartItemDto, lang?: 'en' | 'ar'): Promise<{
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
                nameAr: string | null;
                imageUrl: string | undefined;
                priceCents: number;
                salePriceCents: number | null;
            };
        }[];
        subtotalCents: number;
    }>;
    remove(user: CurrentUserPayload, id: string, lang?: 'en' | 'ar'): Promise<{
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
                nameAr: string | null;
                imageUrl: string | undefined;
                priceCents: number;
                salePriceCents: number | null;
            };
        }[];
        subtotalCents: number;
    }>;
}
