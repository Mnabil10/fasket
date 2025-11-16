import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    me(userId: string): Promise<{
        ordersCount: number;
        totalSpentCents: number;
        points: number;
        loyaltyTier: string;
        id: string;
        email: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        createdAt: Date;
    }>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<{
        ok: boolean;
    }>;
}
