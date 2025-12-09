import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class AdminOrderListDto extends PaginationDto {
    status?: OrderStatus;
    from?: Date;
    to?: Date;
    customer?: string;
    minTotalCents?: number;
    maxTotalCents?: number;
    driverId?: string;
}
