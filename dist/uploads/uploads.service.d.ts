import { S3Client } from '@aws-sdk/client-s3';
export declare class UploadsService {
    private readonly s3;
    private readonly driver;
    private readonly bucket;
    private readonly publicBase;
    private readonly localBase;
    private readonly localRoot;
    private readonly ttl;
    private readonly allowed;
    private readonly maxBytes;
    private readonly sse;
    constructor(s3: S3Client);
    private mapS3Error;
    private validateMime;
    private buildKey;
    private publicUrl;
    private ensureLocalDir;
    checkHealth(): Promise<{
        ok: boolean;
    }>;
    createSignedUrl(params: {
        filename: string;
        contentType: string;
    }): Promise<{
        uploadUrl: string;
        publicUrl: string;
    }>;
    uploadBuffer(file: Express.Multer.File): Promise<{
        url: string;
    }>;
}
