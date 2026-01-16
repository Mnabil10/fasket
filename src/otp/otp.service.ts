import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException, forwardRef } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../common/errors';

export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET' | 'SIGNUP' | 'ORDER_TRACKING';

interface OtpRecord {
  otpHash: string;
  otpId: string;
  attempts: number;
  expiresAt: number;
  requestId: string;
}

interface OtpDispatchInput {
  phone: string;
  purpose: OtpPurpose;
  otpId: string;
  otp: string;
  expiresInSeconds: number;
  requestId: string;
  userId?: string;
}

interface OtpDispatchResult {
  delivered: boolean;
  channel: 'whatsapp';
  error?: string;
}

interface CachedDispatchPayload {
  otpId: string;
  expiresInSeconds: number;
  channel: 'whatsapp';
  requestId: string;
  resendAfterSeconds: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpTtlSec: number;
  private readonly maxAttempts: number;
  private readonly lockMinutes: number;
  private readonly otpRateLimitSeconds: number;
  private readonly otpDailyLimit: number;
  private readonly otpPerIpLimit: number;
  private readonly secret: string;
  private readonly requestIdTtlSeconds: number;
  private readonly otpEnabled: boolean;
  private readonly whatsappEnabled: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEventsService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => AuthService)) private readonly auth: AuthService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {
    this.otpTtlSec = this.resolveOtpTtlSeconds();
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
    this.lockMinutes = Number(this.config.get('OTP_LOCK_MINUTES') ?? 15);
    this.otpRateLimitSeconds = Number(this.config.get('OTP_RATE_LIMIT_SECONDS') ?? 60);
    this.otpDailyLimit = Number(this.config.get('OTP_MAX_PER_DAY') ?? this.config.get('OTP_DAILY_LIMIT') ?? 10);
    this.otpPerIpLimit = Number(this.config.get('OTP_PER_IP_LIMIT') ?? 20);
    this.requestIdTtlSeconds = Math.max(this.otpTtlSec, this.otpRateLimitSeconds);
    this.secret = this.config.get('OTP_SECRET') ?? this.config.get('JWT_ACCESS_SECRET') ?? 'otp-secret';
    this.otpEnabled = (this.config.get<string>('OTP_ENABLED') ?? 'true') !== 'false';
    this.whatsappEnabled = (this.config.get<string>('WHATSAPP_ENABLED') ?? 'true') !== 'false';
    this.ensureSecretStrength();
  }

  async requestOtp(phone: string, purpose: OtpPurpose, ip?: string) {
    this.ensureOtpEnabled();
    this.ensureOtpDeliveryEnabled();
    const normalizedPhone = normalizePhoneToE164(phone);
    this.ensurePurpose(purpose);
    await this.ensureRateLimit(purpose, normalizedPhone, ip);
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });
    if (!existingUser && !['SIGNUP', 'ORDER_TRACKING'].includes(purpose)) {
      throw new BadRequestException('Account not found');
    }

    const otp = this.generateOtp();
    const otpId = randomUUID();
    const requestId = randomUUID();
    const hash = this.hashOtp(otp);
    const expiresAt = Date.now() + this.otpTtlSec * 1000;
    const record: OtpRecord = { otpHash: hash, otpId, attempts: 0, expiresAt, requestId };
    await this.cache.set(this.otpKey(purpose, normalizedPhone), record, this.ttlMs(this.otpTtlSec));

    const deduped = await this.cachedDispatch(requestId);
    if (deduped) {
      return deduped;
    }

    const dispatch = await this.dispatchOtp({
      phone: normalizedPhone,
      purpose,
      otpId,
      otp,
      expiresInSeconds: this.otpTtlSec,
      requestId,
      userId: existingUser?.id,
    });

    if (!dispatch.delivered) {
      await this.cache.del(this.otpKey(purpose, normalizedPhone));
      await this.audit.log({
        action: 'otp.delivery.failed',
        entity: 'otp',
        entityId: otpId,
        before: null,
        after: { purpose, phone: this.maskPhone(normalizedPhone), channel: dispatch.channel, reason: dispatch.error },
      });
      throw new BadRequestException('Unable to send OTP at this time. Please try again later.');
    }

    await this.cacheDispatch(requestId, {
      otpId,
      expiresInSeconds: this.otpTtlSec,
      channel: dispatch.channel,
      requestId,
      resendAfterSeconds: this.otpRateLimitSeconds,
    });

    await this.automation.emit(
      'auth.otp.requested',
      { phone: normalizedPhone, otpId, purpose, expiresInSeconds: this.otpTtlSec, channel: dispatch.channel, requestId },
      { dedupeKey: `otp:requested:${purpose}:${normalizedPhone}:${otpId}` },
    );
    await this.audit.log({
      action: 'otp.requested',
      entity: 'otp',
      entityId: otpId,
      before: null,
      after: { purpose, phone: this.maskPhone(normalizedPhone), channel: dispatch.channel, requestId },
    });
    return {
      otpId,
      expiresInSeconds: this.otpTtlSec,
      channel: dispatch.channel,
      requestId,
      resendAfterSeconds: this.otpRateLimitSeconds,
    };
  }

  async verifyOtp(phone: string, purpose: OtpPurpose, otpId: string, otp: string, ip?: string) {
    this.ensureOtpEnabled();
    const normalizedPhone = normalizePhoneToE164(phone);
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
      throw new UnauthorizedException({
        code: ErrorCode.OTP_LOCKED,
        message: 'Too many attempts. Please try again later.',
      });
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
      throw new UnauthorizedException({
        code: ErrorCode.OTP_EXPIRED,
        message: 'Invalid or expired OTP',
      });
    }

    const requestId = record.requestId;
    const valid = this.hashOtp(otp) === record.otpHash;
    if (!valid) {
      const attempts = record.attempts + 1;
      record.attempts = attempts;
      const ttl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
      await this.cache.set(this.otpKey(purpose, normalizedPhone), record, this.ttlMs(ttl));
      if (attempts >= this.maxAttempts) {
        await this.cache.set(lockKey, true, this.ttlMs(this.lockMinutes * 60));
        await this.cache.del(this.otpKey(purpose, normalizedPhone));
      }
      await this.audit.log({
        action: 'otp.verified.failed',
        entity: 'otp',
        entityId: otpId,
        before: null,
        after: { purpose, phone: this.maskPhone(normalizedPhone), attempts, requestId },
      });
      throw new UnauthorizedException({
        code: attempts >= this.maxAttempts ? ErrorCode.OTP_TOO_MANY_ATTEMPTS : ErrorCode.OTP_INVALID,
        message: attempts >= this.maxAttempts ? 'Too many attempts. Please try again later.' : 'Invalid OTP',
      });
    }

    await this.cache.del(this.otpKey(purpose, normalizedPhone));
    await this.cache.del(lockKey);

    await this.automation.emit(
      'auth.otp.verified',
      { phone: normalizedPhone, otpId, purpose, requestId },
      { dedupeKey: `otp:verified:${purpose}:${normalizedPhone}:${otpId}` },
    );
    await this.audit.log({
      action: 'otp.verified.success',
      entity: 'otp',
      entityId: otpId,
      before: null,
      after: { purpose, phone: this.maskPhone(normalizedPhone), requestId },
    });

    if (purpose === 'LOGIN') {
      const user = await this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (!user) throw new UnauthorizedException('Account not found');
      const tokens = await this.auth.issueTokensForUserId(user.id);
      return { success: true, tokens };
    }

    if (purpose === 'SIGNUP') {
      return { success: true };
    }

    if (purpose === 'PASSWORD_RESET') {
      const resetToken = randomUUID();
      const hashedToken = this.hashOtp(resetToken);
      const ttl = Number(this.config.get('RESET_TOKEN_TTL_SECONDS') ?? 900);
      await this.cache.set(this.resetKey(hashedToken), { phone: normalizedPhone, otpId }, this.ttlMs(ttl));
      await this.sendPasswordResetWhatsapp(normalizedPhone, otp, resetToken, ttl, record.requestId);
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
    this.ensureOtpEnabled();
    const record = await this.cache.get<OtpRecord>(this.otpKey(purpose, normalizePhoneToE164(phone)));
    if (!record) {
      throw new UnauthorizedException({
        code: ErrorCode.OTP_EXPIRED,
        message: 'Invalid or expired OTP',
      });
    }
    return this.verifyOtp(phone, purpose, record.otpId, otp, ip);
  }

  private async dispatchOtp(params: OtpDispatchInput): Promise<OtpDispatchResult> {
    const whatsapp = await this.tryWhatsapp(params);
    if (whatsapp.delivered) {
      return { delivered: true, channel: 'whatsapp' };
    }
    return { delivered: false, channel: 'whatsapp', error: whatsapp.error };
  }

  private async tryWhatsapp(params: OtpDispatchInput) {
    try {
      const expiresMinutes = Math.max(1, Math.ceil(params.expiresInSeconds / 60));
      await this.notifications.sendWhatsappTemplate({
        to: params.phone,
        template: 'otp_verification_v1',
        variables: { otp: params.otp, expires_in: expiresMinutes },
        metadata: { purpose: params.purpose, requestId: params.requestId },
      });
      return { delivered: true };
    } catch (err) {
      const message = (err as Error)?.message || 'whatsapp_failed';
      this.logger.warn({ msg: 'WhatsApp OTP send failed', error: message });
      return { delivered: false, error: message };
    }
  }

  private ensureOtpEnabled() {
    if (!this.otpEnabled) {
      throw new BadRequestException('OTP is disabled');
    }
  }

  private ensureOtpDeliveryEnabled() {
    if (!this.whatsappEnabled) {
      throw new BadRequestException('OTP delivery is disabled');
    }
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
    if (!['LOGIN', 'PASSWORD_RESET', 'SIGNUP', 'ORDER_TRACKING'].includes(purpose)) {
      throw new BadRequestException('Invalid OTP purpose');
    }
  }

  private async ensureRateLimit(purpose: OtpPurpose, phone: string, ip?: string) {
    await this.bumpOrThrow(
      `otp:req:${purpose}:phone:${phone}:minute`,
      1,
      this.otpRateLimitSeconds,
      'Please wait before requesting another OTP',
      ErrorCode.OTP_RATE_LIMIT,
    );
    await this.bumpOrThrow(
      `otp:req:${purpose}:phone:${phone}:day:${this.dayKey()}`,
      this.otpDailyLimit,
      24 * 60 * 60,
      'You have reached the OTP request limit for today',
      ErrorCode.OTP_DAILY_LIMIT,
    );
    if (ip) {
      await this.bumpOrThrow(
        `otp:req:${purpose}:ip:${ip}:minute`,
        this.otpPerIpLimit,
        this.otpRateLimitSeconds,
        'Too many OTP requests from this IP',
        ErrorCode.OTP_IP_LIMIT,
      );
    }
  }

  private async bumpOrThrow(key: string, limit: number, ttl: number, message: string, code: ErrorCode) {
    const current = (await this.cache.get<number>(key)) ?? 0;
    if (current >= limit) {
      throw new HttpException(
        {
          code,
          message,
          details: { resendAfterSeconds: ttl },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.cache.set(key, current + 1, this.ttlMs(ttl));
  }

  private dayKey() {
    return new Date().toISOString().slice(0, 10);
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

  private generateOtp() {
    return ('' + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
  }

  private hashOtp(input: string) {
    return createHash('sha256').update(`${input}:${this.secret}`).digest('hex');
  }

  private authDedupeKey(phone: string, purpose: string, otpId: string) {
    return `auth:${this.hashFragment(phone)}:${purpose}:${otpId}`;
  }

  private resolveOtpTtlSeconds() {
    const env = (this.config.get<string>('NODE_ENV') || '').toLowerCase();
    const testTtl = Number(this.config.get('OTP_TTL_SECONDS_TEST'));
    if (env !== 'production' && Number.isFinite(testTtl) && testTtl > 0) {
      return testTtl;
    }
    const configuredSeconds = Number(this.config.get('OTP_TTL_SECONDS'));
    if (Number.isFinite(configuredSeconds) && configuredSeconds > 0) {
      if (env === 'production' && configuredSeconds < 60) {
        this.logger.warn({
          msg: 'OTP TTL too low in production; using default fallback',
          configuredSeconds,
        });
      } else {
        return configuredSeconds;
      }
    }
    const configuredMinutes = Number(this.config.get('OTP_TTL_MIN'));
    if (Number.isFinite(configuredMinutes) && configuredMinutes > 0) {
      return configuredMinutes * 60;
    }
    return env === 'production' ? 180 : 120;
  }

  private hashFragment(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
  }

  private requestIdKey(requestId: string) {
    return `otp:requestId:${requestId}`;
  }

  private async cacheDispatch(
    requestId: string,
    payload: { otpId: string; expiresInSeconds: number; channel: string; requestId: string; resendAfterSeconds: number },
  ) {
    await this.cache.set(this.requestIdKey(requestId), payload, this.ttlMs(this.requestIdTtlSeconds));
  }

  private ttlMs(seconds: number) {
    return Math.max(1, Math.ceil(seconds * 1000));
  }

  private async cachedDispatch(requestId: string) {
    const cached = await this.cache.get<CachedDispatchPayload>(this.requestIdKey(requestId));
    if (!cached) return undefined;
    return {
      otpId: cached.otpId,
      expiresInSeconds: cached.expiresInSeconds,
      channel: cached.channel as 'whatsapp',
      requestId: cached.requestId,
      resendAfterSeconds: cached.resendAfterSeconds,
    };
  }

  private maskPhone(phone: string) {
    if (!phone) return '';
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }

  private async sendPasswordResetWhatsapp(
    phone: string,
    otp: string,
    resetToken: string,
    ttlSeconds: number,
    requestId: string,
  ) {
    try {
      const link = this.buildResetLink(resetToken);
      await this.notifications.sendWhatsappTemplate({
        to: phone,
        template: 'password_reset_v1',
        variables: { otp, reset_link: link },
        metadata: { purpose: 'PASSWORD_RESET', requestId, ttlSeconds },
      });
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp password reset send failed', error: (err as Error)?.message });
    }
  }

  private buildResetLink(resetToken: string) {
    const base = (this.config.get<string>('PASSWORD_RESET_URL_BASE') || '').trim();
    if (!base) return resetToken;
    if (base.includes('{{token}}')) return base.replace('{{token}}', encodeURIComponent(resetToken));
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}token=${encodeURIComponent(resetToken)}`;
  }
}
