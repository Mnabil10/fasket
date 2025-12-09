import { UploadsService } from './uploads.service';
export declare class UploadsController {
    private readonly uploads;
    constructor(uploads: UploadsService);
    health(): Promise<{
        ok: boolean;
    }>;
    signedUrl(filename?: string, contentType?: string): Promise<{
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
    multipart(file: Express.Multer.File): Promise<import("./uploads.service").ProcessedImageResult>;
}
export declare class UserUploadsController {
    private readonly uploads;
    constructor(uploads: UploadsService);
    signedUrl(filename?: string, contentType?: string, folder?: string): Promise<{
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
}
