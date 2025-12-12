import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { AuditLogService } from '../common/audit/audit-log.service';
export declare class PasswordResetService {
    private readonly cache;
    private readonly prisma;
    private readonly otp;
    private readonly automation;
    private readonly audit;
    private readonly logger;
    private readonly passwordPolicy;
    constructor(cache: Cache, prisma: PrismaService, otp: OtpService, automation: AutomationEventsService, audit: AuditLogService);
    requestReset(phone: string, ip?: string): Promise<{
        otpId: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    confirmReset(resetToken: string, newPassword: string): Promise<{
        success: boolean;
    }>;
    private maskPhone;
}
