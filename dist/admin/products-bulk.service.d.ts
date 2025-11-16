import { PrismaService } from 'src/prisma/prisma.service';
import { SlugService } from '../common/slug/slug.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { RequestContextService } from '../common/context/request-context.service';
export interface RowResult {
    rowNumber: number;
    status: 'created' | 'updated' | 'skipped' | 'error';
    productId?: string;
    errorMessage?: string;
    errorCode?: string;
    dryRun?: boolean;
}
export interface BulkUploadResult {
    created: number;
    updated: number;
    skipped: number;
    errors: {
        row: number;
        code: string;
        message: string;
    }[];
    rows: RowResult[];
    dryRun: boolean;
}
export declare class ProductsBulkService {
    private readonly prisma;
    private readonly slugs;
    private readonly cache;
    private readonly context;
    private readonly statusSet;
    private readonly batchSize;
    constructor(prisma: PrismaService, slugs: SlugService, cache: CacheInvalidationService, context: RequestContextService);
    generateTemplate(): Buffer;
    processUpload(file: Express.Multer.File, options?: {
        dryRun?: boolean;
    }): Promise<BulkUploadResult>;
    private applyOperation;
    private extractRows;
    private hasAnyValue;
    private buildCategoryMap;
    private resolveExistingProduct;
    private mapRowToProduct;
    private resolveCategory;
    private parseMoney;
    private optionalMoney;
    private parseInteger;
    private parseStatus;
    private parseBoolean;
    private optionalString;
    private parseImages;
    private requireString;
    private hasValue;
    private compactData;
    private generateSku;
    private recordStockChange;
}
