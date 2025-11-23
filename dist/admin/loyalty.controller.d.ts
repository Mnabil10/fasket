import { UpdateLoyaltySettingsDto } from './dto/loyalty-settings.dto';
import { SettingsService } from '../settings/settings.service';
import { AdminService } from './admin.service';
import { AdjustPointsDto } from './dto/loyalty-adjust.dto';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { LoyaltyTransactionsQueryDto } from './dto/loyalty-transactions.dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class AdminLoyaltyController {
    private readonly settings;
    private readonly admin;
    private readonly loyalty;
    constructor(settings: SettingsService, admin: AdminService, loyalty: LoyaltyService);
    getSettings(): Promise<{
        loyaltyEnabled: boolean;
        earnRate: number;
        redeemRateValue: number;
        minRedeemPoints: number;
        maxRedeemPerOrder: number;
        maxDiscountPercent: number;
        resetThreshold: number;
    }>;
    updateSettings(dto: UpdateLoyaltySettingsDto, adminUser: CurrentUserPayload): Promise<{
        loyaltyEnabled: boolean;
        earnRate: number;
        redeemRateValue: number;
        minRedeemPoints: number;
        maxRedeemPerOrder: number;
        maxDiscountPercent: number;
        resetThreshold: number;
    }>;
    adjustPoints(adminUser: CurrentUserPayload, userId: string, dto: AdjustPointsDto): Promise<{
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
    userSummary(userId: string): Promise<{
        userId: string;
        name: string;
        email: string | null;
        phone: string;
        balance: number;
        totalEarned: number;
        totalRedeemed: number;
        totalAdjusted: number;
    }>;
    userTransactions(userId: string, query: LoyaltyTransactionsQueryDto): Promise<{
        items: {
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            id: string;
            createdAt: Date;
            userId: string;
            points: number;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            orderId: string | null;
            cycleId: string | null;
        }[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    transactions(query: LoyaltyTransactionsQueryDto): Promise<{
        items: {
            id: string;
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            points: number;
            orderId: string | null;
            user: {
                id: string;
                email: string | null;
                phone: string;
                name: string;
            };
            metadata: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
        }[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    transactionsSummary(): Promise<{
        totalUsersWithPoints: number;
        totalOutstandingPoints: number;
        totalEarnedPoints: number;
        totalRedeemedPoints: number;
        totalAdjustedPoints: number;
    }>;
}
