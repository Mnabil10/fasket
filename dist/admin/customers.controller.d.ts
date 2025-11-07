import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
declare class ResetPasswordDto {
    newPassword: string;
}
export declare class AdminCustomersController {
    private svc;
    constructor(svc: AdminService);
    list(q?: string, page?: PaginationDto): Promise<{
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
            label: string;
            city: string;
            zone: string | null;
            street: string;
            building: string | null;
            apartment: string | null;
            lat: number | null;
            lng: number | null;
            userId: string;
        }[];
        orders: {
            id: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.OrderStatus;
            totalCents: number;
        }[];
    } & {
        id: string;
        email: string | null;
        phone: string;
        password: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
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
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    resetPassword(id: string, dto: ResetPasswordDto): Promise<{
        ok: boolean;
    }>;
}
export {};
