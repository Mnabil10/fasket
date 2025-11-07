import { PrismaService } from '../prisma/prisma.service';
export declare class ProductsService {
    private prisma;
    constructor(prisma: PrismaService);
    list(q: {
        q?: string;
        categoryId?: string;
        min?: number;
        max?: number;
        status?: string;
        lang?: 'en' | 'ar';
    }): Promise<{
        name: string;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        status: import(".prisma/client").$Enums.ProductStatus;
    }[]>;
    one(idOrSlug: string, lang?: 'en' | 'ar'): Promise<any>;
    bestSelling(limit?: number, lang?: 'en' | 'ar'): Promise<({
        name: string;
        totalSold: number;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        priceCents: number;
        salePriceCents: number | null;
    } | null)[]>;
    hotOffers(limit?: number, lang?: 'en' | 'ar'): Promise<{
        name: string;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        priceCents: number;
        salePriceCents: number | null;
    }[]>;
}
