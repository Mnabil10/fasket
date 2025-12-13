import { PrismaService } from '../prisma/prisma.service';
export declare class SupportBackfillController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    backfill(batch?: string): Promise<{
        success: boolean;
        processed: number;
        remaining: string | number;
    }>;
}
