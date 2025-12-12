import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';
export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET';
export declare class OtpService {
    private readonly cache;
    private readonly prisma;
    private readonly automation;
    private readonly config;
    private readonly auth;
    private readonly audit;
    private readonly logger;
    private readonly otpTtlSec;
    private readonly maxAttempts;
    private readonly lockMinutes;
    private readonly secret;
    constructor(cache: Cache, prisma: PrismaService, automation: AutomationEventsService, config: ConfigService, auth: AuthService, audit: AuditLogService);
    requestOtp(phone: string, purpose: OtpPurpose, ip?: string): Promise<{
        otpId: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    verifyOtp(phone: string, purpose: OtpPurpose, otpId: string, otp: string, ip?: string): Promise<{
        success: boolean;
        tokens: {
            accessToken: string;
            refreshToken: string;
        };
        resetToken?: undefined;
        expiresInSeconds?: undefined;
    } | {
        success: boolean;
        resetToken: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
        tokens?: undefined;
    } | {
        success: boolean;
        tokens?: undefined;
        resetToken?: undefined;
        expiresInSeconds?: undefined;
    }>;
    validateResetToken(resetToken: string): Promise<{
        phone: string;
        otpId?: string;
    }>;
    private ensurePurpose;
    private ensureRateLimit;
    private bumpOrThrow;
    private otpKey;
    private lockKey;
    private resetKey;
    private normalizePhone;
    private generateOtp;
    private hashOtp;
    private maskPhone;
}
