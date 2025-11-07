import { AdminService } from './admin.service';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UploadsService } from 'src/uploads/uploads.service';
export declare class AdminProductsController {
    private svc;
    private uploads;
    constructor(svc: AdminService, uploads: UploadsService);
    listHotOffers(q?: string, page?: PaginationDto): Promise<{
        items: any[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    list(q: ProductListQueryDto, page: PaginationDto): Promise<{
        items: any[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    one(id: string): Promise<any>;
    create(dto: CreateProductDto, file?: Express.Multer.File): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        deletedAt: Date | null;
        categoryId: string | null;
        descriptionAr: string | null;
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        status: import(".prisma/client").$Enums.ProductStatus;
        isHotOffer: boolean;
        images: string[];
    }>;
    update(id: string, dto: UpdateProductDto, file?: Express.Multer.File): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        deletedAt: Date | null;
        categoryId: string | null;
        descriptionAr: string | null;
        priceCents: number;
        salePriceCents: number | null;
        stock: number;
        status: import(".prisma/client").$Enums.ProductStatus;
        isHotOffer: boolean;
        images: string[];
    }>;
    remove(id: string): Promise<{
        ok: boolean;
    }>;
}
