import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
export declare class CartController {
    private service;
    constructor(service: CartService);
    get(user: any): Promise<{
        cartId: string;
        items: ({
            product: {
                name: string;
                imageUrl: string | null;
                priceCents: number;
                salePriceCents: number | null;
            };
        } & {
            id: string;
            priceCents: number;
            productId: string;
            qty: number;
            cartId: string;
        })[];
        subtotalCents: number;
    }>;
    add(user: any, dto: AddToCartDto): Promise<{
        id: string;
        priceCents: number;
        productId: string;
        qty: number;
        cartId: string;
    }>;
    update(user: any, id: string, dto: UpdateCartItemDto): Promise<{
        id: string;
        priceCents: number;
        productId: string;
        qty: number;
        cartId: string;
    }>;
    remove(user: any, id: string): Promise<{
        ok: boolean;
    }>;
}
