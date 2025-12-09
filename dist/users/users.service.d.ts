import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class UsersService {
    private prisma;
    private readonly passwordPolicy;
    constructor(prisma: PrismaService);
    me(userId: string): Promise<{
        ordersCount: number;
        totalSpentCents: number;
        points: number;
        loyaltyPoints: number;
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
    updateProfile(userId: string, dto: UpdateProfileDto): Promise<{
        ordersCount: number;
        totalSpentCents: number;
        points: number;
        loyaltyPoints: number;
        loyaltyTier: string;
        id: string;
        email: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        createdAt: Date;
    }>;
}
