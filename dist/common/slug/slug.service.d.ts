import { PrismaService } from '../../prisma/prisma.service';
type SupportedModels = 'product' | 'category';
export declare class SlugService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    generateUniqueSlug(model: SupportedModels, base: string, excludeId?: string): Promise<string>;
    private exists;
}
export {};
