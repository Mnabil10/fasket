import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
export declare class AdminCouponsController {
    private svc;
    private readonly logger;
    constructor(svc: AdminService);
    list(q?: string, page?: PaginationDto): Promise<{
        items: {
            type: import(".prisma/client").$Enums.CouponType;
            code: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            isActive: boolean;
            valueCents: number;
            isPercent: boolean;
            startsAt: Date | null;
            endsAt: Date | null;
            minOrderCents: number | null;
            maxDiscountCents: number | null;
        }[];
        total: number;
        page: number | undefined;
        pageSize: number | undefined;
    }>;
    create(dto: any): import(".prisma/client").Prisma.Prisma__CouponClient<{
        type: import(".prisma/client").$Enums.CouponType;
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        valueCents: number;
        isPercent: boolean;
        startsAt: Date | null;
        endsAt: Date | null;
        minOrderCents: number | null;
        maxDiscountCents: number | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    update(id: string, dto: any): Promise<{
        type: import(".prisma/client").$Enums.CouponType;
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        valueCents: number;
        isPercent: boolean;
        startsAt: Date | null;
        endsAt: Date | null;
        minOrderCents: number | null;
        maxDiscountCents: number | null;
    }>;
}
