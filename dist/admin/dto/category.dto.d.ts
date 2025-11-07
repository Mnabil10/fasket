export declare class CreateCategoryDto {
    name: string;
    nameAr?: string;
    slug: string;
    imageUrl?: string;
    isActive?: boolean;
    sortOrder?: number;
    parentId?: string;
}
declare const UpdateCategoryDto_base: import("@nestjs/common").Type<Partial<CreateCategoryDto>>;
export declare class UpdateCategoryDto extends UpdateCategoryDto_base {
}
declare const CategoryQueryDto_base: import("@nestjs/common").Type<Partial<UpdateCategoryDto>>;
export declare class CategoryQueryDto extends CategoryQueryDto_base {
    q?: string;
}
export {};
