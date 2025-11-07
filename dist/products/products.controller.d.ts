import { ProductsService } from './products.service';
export declare class ProductsController {
    private service;
    constructor(service: ProductsService);
    list(q?: string, categoryId?: string, min?: number, max?: number, lang?: 'en' | 'ar'): Promise<{
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
    bestSelling(limit?: string, lang?: 'en' | 'ar'): Promise<({
        name: string;
        totalSold: number;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        priceCents: number;
        salePriceCents: number | null;
    } | null)[]>;
    hotOffers(limit?: string, lang?: 'en' | 'ar'): Promise<{
        name: string;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        priceCents: number;
        salePriceCents: number | null;
    }[]>;
    one(idOrSlug: string, lang?: 'en' | 'ar'): Promise<any>;
}
