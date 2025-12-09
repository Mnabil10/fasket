import { S3Client } from '@aws-sdk/client-s3';
export interface ProcessedImageResult {
    url: string;
    variants: string[];
    driver: 's3' | 'local' | 'inline';
    warnings?: string[];
}
export declare class UploadsService {
    private readonly s3;
    private readonly logger;
    private readonly originalDriver;
    private driver;
    private readonly bucket;
    private readonly publicBase;
    private readonly localBaseUrl;
    private readonly localPathPrefix;
    private readonly localRoot;
    private readonly ttl;
    private readonly allowed;
    private readonly maxBytes;
    private readonly sse;
    private readonly allowLocalFallback;
    constructor(s3: S3Client);
    private resetDriver;
    private mapS3Error;
    private validateMime;
    private ensureLocalDir;
    private shouldFallbackToLocal;
    private enableLocalFallback;
    private buildKey;
    private publicUrl;
    private joinLocalUrl;
    private detectMime;
    private storeBuffer;
    private storeBufferLocally;
    private deleteKey;
    private extractKeyFromUrl;
    private deriveVariantKeys;
    private deleteUrls;
    private optimizeImage;
    checkHealth(): Promise<{
        ok: boolean;
    }>;
    createSignedUrl(params: {
        filename: string;
        contentType: string;
        folder?: string;
    }): Promise<{
        uploadUrl: null;
        publicUrl: string;
        driver: "local";
        warnings: string[];
        key: string;
    } | {
        uploadUrl: null;
        publicUrl: string;
        driver: "inline";
        warnings: string[];
        key: string;
    } | {
        uploadUrl: string;
        publicUrl: string;
        driver: "s3";
        warnings: string[];
        key: string;
    } | {
        uploadUrl: null;
        publicUrl: string;
        driver: "s3";
        warnings: string[];
        key: string;
    }>;
    uploadBuffer(file: Express.Multer.File): Promise<ProcessedImageResult>;
    processProductImage(file: Express.Multer.File, existing?: string[]): Promise<ProcessedImageResult>;
    processImageAsset(file: Express.Multer.File, options?: {
        folder?: string;
        generateVariants?: boolean;
        existing?: string[];
    }): Promise<ProcessedImageResult>;
}
