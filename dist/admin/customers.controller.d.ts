import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AdjustLoyaltyPointsDto, LoyaltyHistoryQueryDto } from '../loyalty/dto/loyalty.dto';
declare class ResetPasswordDto {
    newPassword: string;
}
declare class AdminCustomerQueryDto extends PaginationDto {
    q?: string;
}
export declare class AdminCustomersController {
    private readonly svc;
    private readonly loyalty;
    constructor(svc: AdminService, loyalty: LoyaltyService);
    list(query: AdminCustomerQueryDto): Promise<{
        items: {
            id: string;
            email: string | null;
            phone: string;
            role: import(".prisma/client").$Enums.UserRole;
            name: string;
            createdAt: Date;
        }[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    detail(id: string): import(".prisma/client").Prisma.Prisma__UserClient<({
        addresses: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            zoneId: string;
            label: string | null;
            city: string | null;
            street: string | null;
            building: string | null;
            apartment: string | null;
            notes: string | null;
            lat: number | null;
            lng: number | null;
            isDefault: boolean;
        }[];
        orders: {
            status: import(".prisma/client").$Enums.OrderStatus;
            id: string;
            createdAt: Date;
            totalCents: number;
        }[];
    } & {
        id: string;
        email: string | null;
        phone: string;
        password: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        loyaltyPoints: number;
        twoFaEnabled: boolean;
        twoFaSecret: string | null;
        createdAt: Date;
        updatedAt: Date;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    updateRole(id: string, dto: {
        role: UserRole;
    }): import(".prisma/client").Prisma.Prisma__UserClient<{
        id: string;
        email: string | null;
        phone: string;
        password: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        loyaltyPoints: number;
        twoFaEnabled: boolean;
        twoFaSecret: string | null;
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    resetPassword(id: string, dto: ResetPasswordDto): Promise<{
        ok: boolean;
    }>;
    loyaltyHistory(id: string, query: LoyaltyHistoryQueryDto): Promise<{
        user: {
            id: string;
            name: string;
            phone: string;
            email: string | null;
        };
        balance: number;
        totals: {
            earned: number;
            redeemed: number;
            adjusted: number;
        };
        transactions: {
            id: string;
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            points: number;
            orderId: string | undefined;
            metadata: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
            createdAt: Date;
        }[];
    }>;
    adjustLoyalty(actor: CurrentUserPayload, id: string, dto: AdjustLoyaltyPointsDto): Promise<{
        balance: number;
        transaction: {
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            id: string;
            createdAt: Date;
            userId: string;
            points: number;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            orderId: string | null;
            cycleId: string | null;
        };
    }>;
}
export {};
