import { UsersService } from './users.service';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class UsersController {
    private service;
    constructor(service: UsersService);
    me(user: CurrentUserPayload): Promise<{
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
    updateProfile(user: CurrentUserPayload, dto: UpdateProfileDto): Promise<{
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
    changePassword(user: CurrentUserPayload, dto: ChangePasswordDto): Promise<{
        ok: boolean;
    }>;
}
