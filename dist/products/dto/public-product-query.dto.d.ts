import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class PublicProductListDto extends PaginationDto {
    q?: string;
    categoryId?: string;
    categorySlug?: string;
    min?: number;
    max?: number;
    lang?: 'en' | 'ar';
    orderBy?: 'createdAt' | 'priceCents' | 'name';
    sort?: 'asc' | 'desc';
}
export declare class PublicProductFeedDto extends PaginationDto {
    lang?: 'en' | 'ar';
    fromDate?: string;
    toDate?: string;
    orderBy?: 'qty';
    sort?: 'desc' | 'asc';
}
