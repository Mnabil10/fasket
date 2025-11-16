import { AdminService } from './admin.service';
import { CategoryListQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { UploadsService } from 'src/uploads/uploads.service';
export declare class AdminCategoriesController {
    private svc;
    private uploads;
    constructor(svc: AdminService, uploads: UploadsService);
    list(query: CategoryListQueryDto): Promise<{
        items: any[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    one(id: string): Promise<any>;
    create(dto: CreateCategoryDto, file?: Express.Multer.File): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        isActive: boolean;
        sortOrder: number;
        parentId: string | null;
        deletedAt: Date | null;
    }>;
    update(id: string, dto: UpdateCategoryDto, file?: Express.Multer.File): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        isActive: boolean;
        sortOrder: number;
        parentId: string | null;
        deletedAt: Date | null;
    }>;
    remove(id: string): Promise<{
        ok: boolean;
    }>;
    private prepareCategoryPayload;
}
