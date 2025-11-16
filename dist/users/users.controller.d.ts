import { UsersService } from './users.service';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ChangePasswordDto } from './dto/change-password.dto';
export declare class UsersController {
    private service;
    constructor(service: UsersService);
    me(user: CurrentUserPayload): Promise<{
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
    changePassword(user: CurrentUserPayload, dto: ChangePasswordDto): Promise<{
        ok: boolean;
    }>;
}
