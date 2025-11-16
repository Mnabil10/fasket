import { PrismaService } from '../prisma/prisma.service';
import { PublicProductFeedDto, PublicProductListDto } from './dto/public-product-query.dto';
import { CacheService } from '../common/cache/cache.service';
type Lang = 'en' | 'ar' | undefined;
export declare class ProductsService {
    private prisma;
    private cache;
    private readonly listTtl;
    private readonly homeTtl;
    constructor(prisma: PrismaService, cache: CacheService);
    list(q: PublicProductListDto): Promise<{
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
    one(idOrSlug: string, lang?: Lang): Promise<{
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
    bestSelling(query?: PublicProductFeedDto): Promise<{
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
    hotOffers(query?: PublicProductFeedDto): Promise<{
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
    private toCents;
    private localize;
    private toProductSummary;
    private toProductDetail;
}
export {};
