import { PrismaService } from '../prisma/prisma.service';
type Lang = 'en' | 'ar' | undefined;
export declare class CartService {
    private prisma;
    constructor(prisma: PrismaService);
    private ensureCart;
    get(userId: string, lang?: Lang): Promise<{
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
    add(userId: string, dto: {
        productId: string;
        qty: number;
    }, lang?: Lang): Promise<{
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
    updateQty(userId: string, id: string, qty: number, lang?: Lang): Promise<{
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
    remove(userId: string, id: string, lang?: Lang): Promise<{
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
    private buildCartResponse;
}
export {};
