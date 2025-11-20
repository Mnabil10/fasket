import { Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
interface RedeemParams {
    userId: string;
    pointsToRedeem: number;
    subtotalCents: number;
    tx: Prisma.TransactionClient;
    orderId?: string;
}
interface AwardParams {
    userId: string;
    subtotalCents: number;
    tx: Prisma.TransactionClient;
    orderId?: string;
}
export declare class LoyaltyService {
    private readonly settings;
    private readonly prisma;
    constructor(settings: SettingsService, prisma: PrismaService);
    redeemPoints(params: RedeemParams): Promise<{
        pointsUsed: number;
        discountCents: number;
    }>;
    awardPoints(params: AwardParams): Promise<number>;
    getUserSummary(userId: string, options?: {
        historyLimit?: number;
    }): Promise<{
        userId: string;
        balance: number;
        recentTransactions: {
            id: string;
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            points: number;
            orderId: string | undefined;
            metadata: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | undefined;
            createdAt: Date;
        }[];
    }>;
    getAdminSummary(userId: string, options?: {
        historyLimit?: number;
    }): Promise<{
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
            metadata: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | undefined;
            createdAt: Date;
        }[];
    }>;
    adjustUserPoints(params: {
        userId: string;
        points: number;
        reason: string;
        actorId?: string;
        metadata?: Record<string, any>;
    }): Promise<{
        balance: number;
        transaction: {
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            id: string;
            createdAt: Date;
            userId: string;
            points: number;
            metadata: Prisma.JsonValue | null;
            orderId: string | null;
            cycleId: string | null;
        };
    }>;
    private ensureCycle;
}
export {};
