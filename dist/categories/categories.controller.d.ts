import { CategoriesService } from './categories.service';
import { PublicCategoryListDto } from './dto/public-category-query.dto';
export declare class CategoriesController {
    private service;
    constructor(service: CategoriesService);
    list(query: PublicCategoryListDto): Promise<{
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
