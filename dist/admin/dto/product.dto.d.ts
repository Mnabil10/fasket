import { PaginationDto } from './pagination.dto';
export declare enum ProductStatusDto {
    DRAFT = "DRAFT",
    ACTIVE = "ACTIVE",
    HIDDEN = "HIDDEN",
    DISCONTINUED = "DISCONTINUED"
}
export declare class CreateProductDto {
    name: string;
    nameAr?: string;
    slug?: string;
    description?: string;
    descriptionAr?: string;
    imageUrl?: string;
    sku?: string;
    priceCents: number;
    salePriceCents?: number;
    stock: number;
    isHotOffer?: boolean;
    status?: ProductStatusDto;
    categoryId?: string;
    images?: string[];
}
declare const UpdateProductDto_base: import("@nestjs/common").Type<Partial<CreateProductDto>>;
export declare class UpdateProductDto extends UpdateProductDto_base {
}
export declare class ProductListQueryDto {
    q?: string;
    categoryId?: string;
    status?: ProductStatusDto;
    minPriceCents?: number;
    maxPriceCents?: number;
    inStock?: boolean;
    orderBy?: 'createdAt' | 'priceCents' | 'name';
    sort?: 'asc' | 'desc';
}
declare const ProductListRequestDto_base: import("@nestjs/common").Type<PaginationDto & ProductListQueryDto>;
export declare class ProductListRequestDto extends ProductListRequestDto_base {
}
export {};
