import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    register(input: {
        name: string;
        phone: string;
        email?: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            phone: string;
            role: import(".prisma/client").$Enums.UserRole;
            name: string;
        };
    }>;
    login(input: {
        phone: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
    }>;
    issueTokens(sub: string, role: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    issueTokensForUserId(sub: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
}
