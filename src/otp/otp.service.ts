import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';

export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET';

interface OtpRecord {
  otpHash: string;
  otpId: string;
  attempts: number;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpTtlSec: number;
  private readonly maxAttempts: number;
  private readonly lockMinutes: number;
  private readonly secret: string;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEventsService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {
    this.otpTtlSec = Number(this.config.get('OTP_TTL_SECONDS') ?? 300);
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
    this.lockMinutes = Number(this.config.get('OTP_LOCK_MINUTES') ?? 15);
    this.secret = this.config.get('OTP_SECRET') ?? this.config.get('JWT_ACCESS_SECRET') ?? 'otp-secret';
    this.ensureSecretStrength();
  }

  async requestOtp(phone: string, purpose: OtpPurpose, ip?: string) {
    const normalizedPhone = this.normalizePhone(phone);
    this.ensurePurpose(purpose);
    await this.ensureRateLimit(normalizedPhone, ip);

    const otp = this.generateOtp();
    const otpId = randomUUID();
    const hash = this.hashOtp(otp);
    const expiresAt = Date.now() + this.otpTtlSec * 1000;
    const record: OtpRecord = { otpHash: hash, otpId, attempts: 0, expiresAt };
    await this.cache.set(this.otpKey(purpose, normalizedPhone), record, this.otpTtlSec);

    await this.automation.emit(
      'auth.otp.requested',
      { phone: normalizedPhone, otpId, purpose, otp, expiresInSeconds: this.otpTtlSec },
      { dedupeKey: `otp:requested:${purpose}:${normalizedPhone}:${otpId}` },
    );
    await this.audit.log({
      action: 'otp.requested',
      entity: 'otp',
      entityId: otpId,
      before: null,
      after: { purpose, phone: this.maskPhone(normalizedPhone) },
    });
    return { otpId, expiresInSeconds: this.otpTtlSec };
  }

  async verifyOtp(phone: string, purpose: OtpPurpose, otpId: string, otp: string, ip?: string) {
    const normalizedPhone = this.normalizePhone(phone);
    this.ensurePurpose(purpose);
    const lockKey = this.lockKey(purpose, normalizedPhone);
    const locked = await this.cache.get<boolean>(lockKey);
    if (locked) {
      await this.audit.log({
        action: 'otp.locked',
        entity: 'otp',
        entityId: otpId,
        before: null,
        after: { purpose, phone: this.maskPhone(normalizedPhone) },
      });
      throw new UnauthorizedException('Too many attempts. Please try again later.');
    }

    const record = await this.cache.get<OtpRecord>(this.otpKey(purpose, normalizedPhone));
    if (!record || record.otpId !== otpId || record.expiresAt < Date.now()) {
      await this.audit.log({
        action: 'otp.verified.failed',
        entity: 'otp',
        entityId: otpId,
        before: null,
        after: { purpose, phone: this.maskPhone(normalizedPhone), reason: 'expired_or_missing' },
      });
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const valid = this.hashOtp(otp) === record.otpHash;
    if (!valid) {
      const attempts = record.attempts + 1;
      record.attempts = attempts;
      const ttl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
      await this.cache.set(this.otpKey(purpose, normalizedPhone), record, ttl);
      if (attempts >= this.maxAttempts) {
        await this.cache.set(lockKey, true, this.lockMinutes * 60);
        await this.cache.del(this.otpKey(purpose, normalizedPhone));
      }
      await this.audit.log({
        action: 'otp.verified.failed',
        entity: 'otp',
        entityId: otpId,
        before: null,
        after: { purpose, phone: this.maskPhone(normalizedPhone), attempts },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.cache.del(this.otpKey(purpose, normalizedPhone));
    await this.cache.del(lockKey);

    await this.automation.emit(
      'auth.otp.verified',
      { phone: normalizedPhone, otpId, purpose },
      { dedupeKey: `otp:verified:${purpose}:${normalizedPhone}:${otpId}` },
    );
    await this.audit.log({
      action: 'otp.verified.success',
      entity: 'otp',
      entityId: otpId,
      before: null,
      after: { purpose, phone: this.maskPhone(normalizedPhone) },
    });

    if (purpose === 'LOGIN') {
      const user = await this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (!user) throw new UnauthorizedException('Account not found');
      const tokens = await this.auth.issueTokensForUserId(user.id);
      return { success: true, tokens };
    }

    if (purpose === 'PASSWORD_RESET') {
      const resetToken = randomUUID();
      const hashedToken = this.hashOtp(resetToken);
      const ttl = Number(process.env.RESET_TOKEN_TTL_SECONDS ?? 900);
      await this.cache.set(this.resetKey(hashedToken), { phone: normalizedPhone, otpId }, ttl);
      return { success: true, resetToken, expiresInSeconds: ttl };
    }

    return { success: true };
  }

  async validateResetToken(resetToken: string): Promise<{ phone: string; otpId?: string }> {
    const hashed = this.hashOtp(resetToken);
    const entry = await this.cache.get<{ phone: string; otpId?: string }>(this.resetKey(hashed));
    if (!entry) {
      throw new UnauthorizedException('Reset token is invalid or expired');
    }
    await this.cache.del(this.resetKey(hashed));
    return entry;
  }

  async verifyOtpLegacy(phone: string, purpose: OtpPurpose, otp: string, ip?: string) {
    const record = await this.cache.get<OtpRecord>(this.otpKey(purpose, this.normalizePhone(phone)));
    if (!record) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    return this.verifyOtp(phone, purpose, record.otpId, otp, ip);
  }

  private ensureSecretStrength() {
    const env = (this.config.get<string>('NODE_ENV') || '').toLowerCase();
    const prodLike = env === 'production' || env === 'staging';
    const tooWeak = !this.secret || this.secret === 'otp-secret' || this.secret.length < 16;
    if (tooWeak) {
      const msg = 'OTP_SECRET is missing or too weak';
      if (prodLike) {
        this.logger.error(msg);
        throw new Error(msg);
      }
      this.logger.warn(msg);
    }
  }

  private ensurePurpose(purpose: OtpPurpose) {
    if (!['LOGIN', 'PASSWORD_RESET'].includes(purpose)) {
      throw new BadRequestException('Invalid OTP purpose');
    }
  }

  private async ensureRateLimit(phone: string, ip?: string) {
    await this.bumpOrThrow(`otp:req:phone:${phone}`, 3, 600, 'Too many OTP requests for this phone');
    if (ip) {
      await this.bumpOrThrow(`otp:req:ip:${ip}`, 10, 600, 'Too many OTP requests from this IP');
    }
  }

  private async bumpOrThrow(key: string, limit: number, ttl: number, message: string) {
    const current = (await this.cache.get<number>(key)) ?? 0;
    if (current >= limit) {
      throw new UnauthorizedException(message);
    }
    await this.cache.set(key, current + 1, ttl);
  }

  private otpKey(purpose: string, phone: string) {
    return `otp:${purpose}:${phone}`;
  }

  private lockKey(purpose: string, phone: string) {
    return `otp:lock:${purpose}:${phone}`;
  }

  private resetKey(hashedToken: string) {
    return `reset:${hashedToken}`;
  }

  private normalizePhone(phone: string) {
    const trimmed = (phone || '').trim();
    const e164 = /^\+?[1-9]\d{7,14}$/;
    if (!e164.test(trimmed)) {
      throw new BadRequestException('Invalid phone');
    }
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private generateOtp() {
    return ('' + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
  }

  private hashOtp(input: string) {
    return createHash('sha256').update(`${input}:${this.secret}`).digest('hex');
  }

  private maskPhone(phone: string) {
    if (!phone) return '';
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }
}
