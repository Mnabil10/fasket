import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
export declare class AuthService {
    private prisma;
    private jwt;
    private readonly rateLimiter;
    private readonly config;
    constructor(prisma: PrismaService, jwt: JwtService, rateLimiter: AuthRateLimitService, config: ConfigService);
    private readonly logger;
    private normalizeEmail;
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
        identifier: string;
        password: string;
    }, metadata: {
        ip?: string;
        userAgent?: string;
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
    issueTokens(user: {
        id: string;
        role: string;
        phone: string;
        email?: string | null;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    issueTokensForUserId(sub: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    private logSession;
}
