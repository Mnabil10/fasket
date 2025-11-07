import { UploadsService } from './uploads.service';
export declare class UploadsController {
    private readonly uploads;
    constructor(uploads: UploadsService);
    health(): Promise<{
        ok: boolean;
    }>;
    signedUrl(filename?: string, contentType?: string): Promise<{
        uploadUrl: string;
        publicUrl: string;
    }>;
    multipart(file: Express.Multer.File): Promise<{
        url: string;
    }>;
}
