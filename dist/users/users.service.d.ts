import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    me(userId: string): import(".prisma/client").Prisma.Prisma__UserClient<{
        id: string;
        email: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        createdAt: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
}
