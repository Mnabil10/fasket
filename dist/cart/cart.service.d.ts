import { PrismaService } from '../prisma/prisma.service';
export declare class CartService {
    private prisma;
    constructor(prisma: PrismaService);
    ensureCart(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    get(userId: string): Promise<{
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
    add(userId: string, dto: {
        productId: string;
        qty: number;
    }): Promise<{
        id: string;
        priceCents: number;
        productId: string;
        qty: number;
        cartId: string;
    }>;
    updateQty(userId: string, id: string, qty: number): Promise<{
        id: string;
        priceCents: number;
        productId: string;
        qty: number;
        cartId: string;
    }>;
    remove(userId: string, id: string): Promise<{
        ok: boolean;
    }>;
}
