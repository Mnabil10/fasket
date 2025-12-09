import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { Cache } from 'cache-manager';
export declare class AuthService {
    private prisma;
    private jwt;
    private readonly rateLimiter;
    private readonly config;
    private readonly cache;
    constructor(prisma: PrismaService, jwt: JwtService, rateLimiter: AuthRateLimitService, config: ConfigService, cache: Cache);
    private readonly logger;
    private readonly otpDigits;
    private normalizeEmail;
    private bcryptRounds;
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
        otp?: string;
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
    setupAdminTwoFa(userId: string): Promise<{
        secret: string;
        secretBase32: string;
        otpauthUrl: string;
    }>;
    enableAdminTwoFa(userId: string, otp: string): Promise<{
        enabled: boolean;
    }>;
    disableAdminTwoFa(userId: string): Promise<{
        enabled: boolean;
    }>;
    issueTokens(user: {
        id: string;
        role: string;
        phone: string;
        email?: string | null;
        twoFaVerified?: boolean;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    issueTokensForUserId(sub: string, previousJti?: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    private logSession;
    private generateSecret;
    private toBase32;
    private verifyTotp;
    private generateTotp;
    private refreshCacheKey;
}
