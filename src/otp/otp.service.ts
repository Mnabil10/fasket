import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException, forwardRef } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomUUID, createHash, createHmac } from 'crypto';
import axios from 'axios';
import { TelegramLink } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { TelegramService } from '../telegram/telegram.service';
import { RequestContextService } from '../common/context/request-context.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';

export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET' | 'SIGNUP';

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
  channel: 'telegram' | 'fallback' | 'sms_required';
  blocked?: boolean;
  error?: string;
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
  private readonly automationWebhookUrl?: string;
  private readonly automationHmacSecret?: string;
  private readonly automationWebhookSecret?: string;
  private readonly secret: string;
  private readonly requestIdTtlSeconds: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEventsService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => AuthService)) private readonly auth: AuthService,
    private readonly audit: AuditLogService,
    private readonly telegram: TelegramService,
    private readonly context: RequestContextService,
  ) {
    this.otpTtlSec = this.resolveOtpTtlSeconds();
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
    this.lockMinutes = Number(this.config.get('OTP_LOCK_MINUTES') ?? 15);
    this.otpRateLimitSeconds = Number(this.config.get('OTP_RATE_LIMIT_SECONDS') ?? 60);
    this.otpDailyLimit = Number(this.config.get('OTP_MAX_PER_DAY') ?? this.config.get('OTP_DAILY_LIMIT') ?? 10);
    this.otpPerIpLimit = Number(this.config.get('OTP_PER_IP_LIMIT') ?? 20);
    this.automationWebhookUrl = this.config.get('AUTOMATION_WEBHOOK_URL') ?? undefined;
    this.automationHmacSecret = this.config.get('AUTOMATION_HMAC_SECRET') ?? undefined;
    this.automationWebhookSecret = this.config.get('AUTOMATION_WEBHOOK_SECRET') ?? undefined;
    this.requestIdTtlSeconds = Math.max(this.otpTtlSec, this.otpRateLimitSeconds);
    this.secret = this.config.get('OTP_SECRET') ?? this.config.get('JWT_ACCESS_SECRET') ?? 'otp-secret';
    this.ensureSecretStrength();
  }

  async requestOtp(phone: string, purpose: OtpPurpose, ip?: string) {
    const normalizedPhone = normalizePhoneToE164(phone);
    this.ensurePurpose(purpose);
    await this.ensureRateLimit(purpose, normalizedPhone, ip);
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });
    if (!existingUser && purpose !== 'SIGNUP') {
      throw new BadRequestException('Account not found');
    }

    const otp = this.generateOtp();
    const otpId = randomUUID();
    const requestId = randomUUID();
    const hash = this.hashOtp(otp);
    const expiresAt = Date.now() + this.otpTtlSec * 1000;
    const record: OtpRecord = { otpHash: hash, otpId, attempts: 0, expiresAt, requestId };
    await this.cache.set(this.otpKey(purpose, normalizedPhone), record, this.otpTtlSec);

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
      if (dispatch.channel === 'sms_required') {
        return {
          otpId,
          expiresInSeconds: this.otpTtlSec,
          expires: Math.ceil(this.otpTtlSec / 60),
          channel: 'sms_required',
          requestId,
        };
      }
      throw new BadRequestException('Unable to send OTP at this time. Please try again later.');
    }

    await this.cacheDispatch(requestId, {
      otpId,
      expiresInSeconds: this.otpTtlSec,
      channel: dispatch.channel,
      requestId,
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
    };
  }

  async verifyOtp(phone: string, purpose: OtpPurpose, otpId: string, otp: string, ip?: string) {
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

    const requestId = record.requestId;
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
        after: { purpose, phone: this.maskPhone(normalizedPhone), attempts, requestId },
      });
      throw new UnauthorizedException('Invalid OTP');
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
    const record = await this.cache.get<OtpRecord>(this.otpKey(purpose, normalizePhoneToE164(phone)));
    if (!record) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    return this.verifyOtp(phone, purpose, record.otpId, otp, ip);
  }

  private async dispatchOtp(params: OtpDispatchInput): Promise<OtpDispatchResult> {
    let blocked = false;
    const link = await this.telegram.getActiveLinkByPhone(params.phone);
    const userId = params.userId ?? (await this.prisma.user.findUnique({ where: { phone: params.phone }, select: { id: true } }))?.id;

    if (link && userId) {
      const result = await this.tryTelegram(link, params, userId);
      if (result.delivered) {
        return { delivered: true, channel: 'telegram' };
      }
      blocked = result.blocked ?? false;
    }

    const fallback = await this.sendFallbackOtp(params);
    if (fallback.delivered) {
      await this.cacheDispatch(params.requestId, { otpId: params.otpId, expiresInSeconds: params.expiresInSeconds, channel: 'fallback', requestId: params.requestId });
      return { delivered: true, channel: 'fallback', blocked };
    }
    return { delivered: false, channel: 'sms_required', blocked, error: fallback.error };
  }

  private async tryTelegram(link: TelegramLink, params: OtpDispatchInput, userId: string) {
    const first = await this.telegram.sendOtp({
      link,
      otp: params.otp,
      expiresInSeconds: params.expiresInSeconds,
      userId,
      purpose: params.purpose,
      requestId: params.requestId,
      phone: params.phone,
    });
    if (first.ok) {
      return { delivered: true, blocked: false };
    }
    if (first.blocked) {
      return { delivered: false, blocked: true, error: first.error };
    }

    const second = await this.telegram.sendOtp({
      link,
      otp: params.otp,
      expiresInSeconds: params.expiresInSeconds,
      userId,
      purpose: params.purpose,
      requestId: params.requestId,
      phone: params.phone,
    });
    if (second.ok) {
      return { delivered: true, blocked: false };
    }
    return { delivered: false, blocked: second.blocked, error: second.error ?? first.error };
  }

  private async sendFallbackOtp(params: OtpDispatchInput) {
    if (!this.automationWebhookUrl || !this.automationHmacSecret) {
      this.logger.warn('Fallback OTP webhook not configured');
      return { delivered: false, error: 'fallback_unavailable' };
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      event_id: params.requestId,
      event_type: 'auth.otp.requested',
      occurred_at: new Date().toISOString(),
      correlation_id: this.context.get('correlationId'),
      version: '1.0',
      dedupe_key: this.authDedupeKey(params.phone, params.purpose, params.otpId),
      attempt: 1,
      data: {
        phone: params.phone,
        otpId: params.otpId,
        purpose: params.purpose,
        otp: params.otp,
        expiresInSeconds: params.expiresInSeconds,
        channel: 'fallback',
      },
    };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', this.automationHmacSecret).update(`${timestamp}.${body}`).digest('hex');
    try {
      const response = await axios.post(this.automationWebhookUrl, body, {
        headers: {
          'content-type': 'application/json',
          ...(this.automationWebhookSecret ? { 'x-fasket-secret': this.automationWebhookSecret } : {}),
          'x-fasket-event': payload.event_type,
          'x-fasket-id': payload.event_id,
          'x-fasket-timestamp': String(timestamp),
          'x-fasket-signature': signature,
          'x-fasket-attempt': '1',
          'x-fasket-spec-version': '1.0',
        },
        timeout: 5000,
        validateStatus: () => true,
      });
      if ((response.status >= 200 && response.status < 300) || response.status === 409) {
        await this.cacheDispatch(params.requestId, {
          otpId: params.otpId,
          expiresInSeconds: params.expiresInSeconds,
          channel: 'fallback',
          requestId: params.requestId,
        });
        return { delivered: true };
      }
      this.logger.warn({ msg: 'Fallback OTP webhook failed', status: response.status });
      return { delivered: false, error: `status_${response.status}` };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn({ msg: 'Fallback OTP webhook error', error: message });
      return { delivered: false, error: message };
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
    if (!['LOGIN', 'PASSWORD_RESET', 'SIGNUP'].includes(purpose)) {
      throw new BadRequestException('Invalid OTP purpose');
    }
  }

  private async ensureRateLimit(purpose: OtpPurpose, phone: string, ip?: string) {
    await this.bumpOrThrow(
      `otp:req:${purpose}:phone:${phone}:minute`,
      1,
      this.otpRateLimitSeconds,
      'Please wait before requesting another OTP',
    );
    await this.bumpOrThrow(
      `otp:req:${purpose}:phone:${phone}:day:${this.dayKey()}`,
      this.otpDailyLimit,
      24 * 60 * 60,
      'You have reached the OTP request limit for today',
    );
    if (ip) {
      await this.bumpOrThrow(
        `otp:req:${purpose}:ip:${ip}:minute`,
        this.otpPerIpLimit,
        this.otpRateLimitSeconds,
        'Too many OTP requests from this IP',
      );
    }
  }

  private async bumpOrThrow(key: string, limit: number, ttl: number, message: string) {
    const current = (await this.cache.get<number>(key)) ?? 0;
    if (current >= limit) {
      throw new UnauthorizedException(message);
    }
    await this.cache.set(key, current + 1, ttl);
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
    payload: { otpId: string; expiresInSeconds: number; channel: string; requestId: string },
  ) {
    await this.cache.set(this.requestIdKey(requestId), payload, this.requestIdTtlSeconds);
  }

  private async cachedDispatch(requestId: string) {
    const cached = await this.cache.get<any>(this.requestIdKey(requestId));
    if (!cached) return undefined;
    return {
      otpId: cached.otpId,
      expiresInSeconds: cached.expiresInSeconds,
      channel: cached.channel as 'telegram' | 'fallback' | 'sms_required',
      requestId: cached.requestId,
    };
  }

  private maskPhone(phone: string) {
    if (!phone) return '';
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }
}
