import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { AuditLogService } from '../common/audit/audit-log.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly automation: AutomationEventsService,
    private readonly audit: AuditLogService,
  ) {}

  async requestReset(phone: string, ip?: string) {
    const result = await this.otp.requestOtp(phone, 'PASSWORD_RESET', ip);
    await this.automation.emit(
      'auth.password_reset.requested',
      { phone, otpId: result.otpId },
      { dedupeKey: `reset:requested:${phone}:${result.otpId}` },
    );
    return result;
  }

  async confirmReset(resetToken: string, newPassword: string) {
    if (!resetToken?.trim()) {
      throw new BadRequestException('Reset token is required');
    }
    if (!this.passwordPolicy.test(newPassword)) {
      throw new BadRequestException('Password must be at least 8 chars and contain letters and numbers');
    }
    const entry = await this.otp.validateResetToken(resetToken.trim());
    const user = await this.prisma.user.findUnique({ where: { phone: entry.phone } });
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const hash = await bcrypt.hash(newPassword, rounds);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });
    // Invalidate existing refresh tokens if cache supports pattern delete
    try {
      const store: any = (this.cache as any).store;
      if (typeof store?.keys === 'function') {
        const keys: string[] = await store.keys(`refresh:${user.id}:*`);
        await Promise.all(keys.map((key) => this.cache.del(key)));
      }
    } catch {
      /* ignore */
    }
    await this.automation.emit(
      'auth.password_reset.completed',
      { phone: entry.phone, userId: user.id },
      { dedupeKey: `reset:completed:${user.id}:${Date.now()}` },
    );
    await this.audit.log({
      action: 'password.reset.completed',
      entity: 'user',
      entityId: user.id,
      before: null,
      after: { phone: this.maskPhone(entry.phone) },
    });
    return { success: true };
  }

  private maskPhone(phone: string) {
    if (!phone) return '';
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }
}
