import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { PublicCategoryListDto } from './dto/public-category-query.dto';
export declare class CategoriesService {
    private prisma;
    private cache;
    private readonly ttl;
    constructor(prisma: PrismaService, cache: CacheService);
    listActive(query: PublicCategoryListDto): Promise<{
        items: {
            name: string;
            imageUrl: string | undefined;
            id: string;
            nameAr: string | null;
            slug: string;
            parentId: string | null;
        }[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
}
