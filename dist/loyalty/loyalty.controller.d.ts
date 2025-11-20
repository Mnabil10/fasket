import { LoyaltyService } from './loyalty.service';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { LoyaltyHistoryQueryDto } from './dto/loyalty.dto';
export declare class UserLoyaltyController {
    private readonly loyalty;
    constructor(loyalty: LoyaltyService);
    summary(user: CurrentUserPayload, query: LoyaltyHistoryQueryDto): Promise<{
        userId: string;
        balance: number;
        recentTransactions: {
            id: string;
            type: import(".prisma/client").$Enums.LoyaltyTransactionType;
            points: number;
            orderId: string | undefined;
            metadata: string | number | boolean | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray | undefined;
            createdAt: Date;
        }[];
    }>;
}
