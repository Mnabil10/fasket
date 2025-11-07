import { PrismaService } from '../prisma/prisma.service';
export declare class CategoriesService {
    private prisma;
    constructor(prisma: PrismaService);
    listActive(lang?: 'en' | 'ar'): Promise<{
        name: string;
        imageUrl: string | undefined;
        id: string;
        nameAr: string | null;
        slug: string;
        parentId: string | null;
    }[]>;
}
