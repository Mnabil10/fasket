import { ProductsService } from './products.service';
import { PublicProductFeedDto, PublicProductListDto } from './dto/public-product-query.dto';
export declare class ProductsController {
    private service;
    constructor(service: ProductsService);
    list(query: PublicProductListDto): Promise<{
        items: {
            id: string;
            name: string;
            slug: string;
            imageUrl: string | undefined;
            priceCents: number;
            salePriceCents: number | null;
            stock: number;
            category: {
                id: string;
                name: string;
                slug: string;
            } | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    bestSelling(query: PublicProductFeedDto): Promise<{
        id: string;
        name: string;
        slug: string;
        imageUrl: string | undefined;
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        category: {
            id: string;
            name: string;
            slug: string;
        } | null;
    }[]>;
    hotOffers(query: PublicProductFeedDto): Promise<{
        id: string;
        name: string;
        slug: string;
        imageUrl: string | undefined;
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        category: {
            id: string;
            name: string;
            slug: string;
        } | null;
    }[]>;
    one(idOrSlug: string, lang?: 'en' | 'ar'): Promise<{
        id: string;
        name: string;
        slug: string;
        description: string;
        descriptionAr: string | null;
        descriptionEn: string | null;
        imageUrl: string | undefined;
        images: string[];
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        status: import(".prisma/client").$Enums.ProductStatus;
        isHotOffer: boolean;
        category: {
            id: string;
            name: string;
            slug: string;
        } | null;
    } | null>;
}
