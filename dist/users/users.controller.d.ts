import { UsersService } from './users.service';
export declare class UsersController {
    private service;
    constructor(service: UsersService);
    me(user: any): import(".prisma/client").Prisma.Prisma__UserClient<{
        id: string;
        email: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string;
        createdAt: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
}
