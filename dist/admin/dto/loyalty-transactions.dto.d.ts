import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class LoyaltyTransactionsQueryDto extends PaginationDto {
    type?: 'EARN' | 'REDEEM' | 'ADJUST';
    fromDate?: string;
    toDate?: string;
    orderId?: string;
    userId?: string;
    userSearch?: string;
}
