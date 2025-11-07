import { CategoriesService } from './categories.service';
export declare class CategoriesController {
    private service;
    constructor(service: CategoriesService);
    list(lang?: 'en' | 'ar'): Promise<{
        name: string;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        parentId: string | null;
    }[]>;
}
