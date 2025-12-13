import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
declare class SupportQueriesDto extends PaginationDto {
    phone?: string;
    code?: string;
    intent?: string;
    status?: string;
}
export declare class AdminSupportController {
    private readonly svc;
    constructor(svc: AdminService);
    list(query: SupportQueriesDto): Promise<{
        items: {
            id: string;
            createdAt: Date;
            phone: null;
            orderCode: null;
            intent: string;
            status: string;
            responseSnippet: null;
            correlationId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
export {};
