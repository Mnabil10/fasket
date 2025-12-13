import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';
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
    export(from: string, to: string, format: string | undefined, res: Response): Promise<Response<any, Record<string, any>>>;
    private computeRange;
}
