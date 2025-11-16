import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class PublicCategoryListDto extends PaginationDto {
    lang?: 'en' | 'ar';
    q?: string;
    sort?: 'asc' | 'desc';
}
