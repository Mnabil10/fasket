import { PrismaService } from '../prisma/prisma.service';
export declare class AdminReportsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    daily(date: string): Promise<{
        date: string;
        ordersCount: number;
        salesCents: number;
        discountCents: number;
        deliveryFeeCents: number;
        netRevenueCents: number;
        cogsCents: number;
        grossProfitCents: number;
        grossMarginPct: number;
        missingCostCount: number;
    }>;
    range(from: string, to: string): Promise<{
        date: string;
        ordersCount: number;
        salesCents: number;
        discountCents: number;
        deliveryFeeCents: number;
        netRevenueCents: number;
        cogsCents: number;
        grossProfitCents: number;
        grossMarginPct: number;
        missingCostCount: number;
    }>;
    private computeRange;
}
