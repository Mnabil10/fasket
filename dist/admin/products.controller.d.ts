import { StreamableFile } from '@nestjs/common';
import { AdminService } from './admin.service';
import { BulkUploadResult, ProductsBulkService } from './products-bulk.service';
import { CreateProductDto, ProductListRequestDto, UpdateProductDto } from './dto/product.dto';
import { UploadsService } from 'src/uploads/uploads.service';
import { RequestContextService } from '../common/context/request-context.service';
export declare class AdminProductsController {
    private svc;
    private uploads;
    private bulkService;
    private readonly context;
    private readonly logger;
    constructor(svc: AdminService, uploads: UploadsService, bulkService: ProductsBulkService, context: RequestContextService);
    downloadBulkTemplate(): StreamableFile;
    bulkUpload(file: Express.Multer.File, dryRun?: string): Promise<BulkUploadResult>;
    listHotOffers(query: ProductListRequestDto): Promise<{
        items: any[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    list(query: ProductListRequestDto): Promise<{
        items: any[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    one(id: string): Promise<any>;
    create(dto: CreateProductDto, file?: Express.Multer.File): Promise<{
        description: string | null;
        status: import(".prisma/client").$Enums.ProductStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        deletedAt: Date | null;
        categoryId: string | null;
        priceCents: number;
        sku: string | null;
        descriptionAr: string | null;
        salePriceCents: number | null;
        stock: number;
        isHotOffer: boolean;
        images: string[];
    }>;
    update(id: string, dto: UpdateProductDto, file?: Express.Multer.File): Promise<{
        description: string | null;
        status: import(".prisma/client").$Enums.ProductStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        nameAr: string | null;
        slug: string;
        imageUrl: string | null;
        deletedAt: Date | null;
        categoryId: string | null;
        priceCents: number;
        sku: string | null;
        descriptionAr: string | null;
        salePriceCents: number | null;
        stock: number;
        isHotOffer: boolean;
        images: string[];
    }>;
    remove(id: string): Promise<{
        ok: boolean;
    }>;
    private prepareProductPayload;
    private normalizeImagesInput;
    private generateSku;
    private recordStockChange;
}
