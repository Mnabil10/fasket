import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { buildDeviceInfo } from '../common/utils/device.util';
import { DomainError, ErrorCode } from '../common/errors';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { OtpService } from '../otp/otp.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import { TelegramService } from '../telegram/telegram.service';

interface PendingSignup {
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  createdAt: number;
  ip?: string;
  userAgent?: string;
}

interface SignupSessionTokenPayload {
  phone: string;
  country: string;
  fullName?: string;
  nonce: string;
  iat: number;
  exp: number;
}

interface SignupLinkTokenPayload {
  sessionKey: string;
  exp: number;
}

interface SignupLinkRecord {
  sessionKey: string;
  telegramChatId: bigint;
  telegramUserId?: bigint | null;
  telegramUsername?: string | null;
  expiresAt: Date;
  otpHash?: string | null;
  otpExpiresAt?: Date | null;
  otpAttempts?: number | null;
  requestId?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly rateLimiter: AuthRateLimitService,
    private readonly config: ConfigService,
  @Inject(forwardRef(() => OtpService)) private readonly otp: OtpService,
  @Inject(CACHE_MANAGER) private readonly cache: Cache,
  private readonly telegram: TelegramService,
) {}
  private readonly logger = new Logger(AuthService.name);
  private readonly otpDigits = 6;
  private readonly debugLogUntil = Date.now() + 10 * 60 * 1000;

  private get signupSessionTtlSeconds() {
    const ttl = Number(this.config.get('SIGNUP_SESSION_TTL_SECONDS') ?? this.config.get('SIGNUP_SESSION_TTL'));
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 900;
  }

  private get linkTokenTtlSeconds() {
    const ttlSeconds =
      Number(this.config.get('TELEGRAM_LINK_TOKEN_TTL_SECONDS')) ||
      Number(this.config.get('TELEGRAM_LINK_TOKEN_TTL_MIN')) * 60 ||
      600;
    return Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 600;
  }

  private normalizeEmail(email?: string | null) {
    return email ? email.trim().toLowerCase() : undefined;
  }

  private bcryptRounds() {
    const parsed = Number(this.config.get('BCRYPT_ROUNDS') ?? 12);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
  }

  async register(input: { name: string; phone: string; email?: string; password: string }) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const or: any[] = [{ phone: input.phone }];
    if (normalizedEmail) or.push({ email: normalizedEmail });
    const exists = await this.prisma.user.findFirst({ where: { OR: or } });
    if (exists) throw new BadRequestException('User already exists');

    const hash = await bcrypt.hash(input.password, this.bcryptRounds());
    const user = await this.prisma.user.create({
      data: { name: input.name, phone: input.phone, email: normalizedEmail, password: hash },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    const tokens = await this.issueTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
    });
    await this.logSession(user.id, { ip: undefined, userAgent: undefined });
    return { user, ...tokens };
  }

  async login(
    input: { identifier: string; password: string; otp?: string },
    metadata: { ip?: string; userAgent?: string },
  ) {
    const identifier = input.identifier?.trim();
    if (!identifier) {
      this.logger.warn({ msg: 'Login failed - empty identifier', ip: metadata.ip });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.rateLimiter.ensureCanAttempt(identifier, metadata.ip);
    const normalizedEmail = this.normalizeEmail(identifier);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: identifier },
          { email: identifier },
          ...(normalizedEmail && normalizedEmail !== identifier ? [{ email: normalizedEmail }] : []),
        ],
      },
    });
    if (!user) {
      await this.rateLimiter.trackFailure(identifier, metadata.ip);
      this.logger.warn({ msg: 'Login failed - user not found', identifier, ip: metadata.ip });
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) {
      await this.rateLimiter.trackFailure(identifier, metadata.ip);
      this.logger.warn({ msg: 'Login failed - bad password', userId: user.id, ip: metadata.ip });
      throw new UnauthorizedException('Invalid credentials');
    }

    const requireAdmin2fa = (this.config.get<string>('AUTH_REQUIRE_ADMIN_2FA') ?? 'false') === 'true';
    const providedOtp = input.otp?.trim();
    let twoFaVerified = !user.twoFaEnabled;

    if (user.role === 'ADMIN') {
      if (!requireAdmin2fa) {
        twoFaVerified = true;
      } else {
        if (!user.twoFaEnabled) {
          throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Admin accounts must enable two-factor authentication');
        }
        if (!providedOtp || !this.verifyTotp(providedOtp, user.twoFaSecret ?? '')) {
          this.logger.warn({ msg: 'Admin 2FA verification failed', userId: user.id, ip: metadata.ip });
          throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Two-factor authentication required');
        }
        twoFaVerified = true;
      }
    }

    await this.rateLimiter.reset(identifier, metadata.ip);
    const tokens = await this.issueTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      twoFaVerified,
    });
    const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
    await this.logSession(user.id, metadata);
    this.logger.log({ msg: 'Login success', userId: user.id, ip: metadata.ip });
    return { user: safeUser, ...tokens };
  }

  async signupStart(
    input: { name: string; phone: string; email?: string; password: string },
    metadata: { ip?: string; userAgent?: string },
  ) {
    const normalizedPhone = this.normalizePhone(input.phone);
    const normalizedEmail = this.normalizeEmail(input.email);
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ phone: normalizedPhone }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] },
    });
    if (exists) throw new BadRequestException('User already exists');

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds());
    const otpResult = await this.otp.requestOtp(normalizedPhone, 'SIGNUP', metadata.ip);
    const pending: PendingSignup = {
      name: input.name?.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      passwordHash,
      createdAt: Date.now(),
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    };
    const ttl = Math.max(otpResult.expiresInSeconds ?? 300, 60);
    await this.cache.set(this.signupCacheKey(otpResult.otpId), pending, ttl);
    return { otpId: otpResult.otpId, expiresInSeconds: otpResult.expiresInSeconds };
  }

  async signupVerify(input: { otpId: string; otp: string }, metadata: { ip?: string; userAgent?: string }) {
    const otpId = input.otpId?.trim();
    const otp = input.otp?.trim();
    if (!otpId || !otp) {
      throw new BadRequestException('OTP verification requires otpId and otp');
    }

    const pending = await this.cache.get<PendingSignup>(this.signupCacheKey(otpId));
    if (!pending) {
      throw new UnauthorizedException('Signup session expired. Please restart the process.');
    }

    await this.otp.verifyOtp(pending.phone, 'SIGNUP', otpId, otp, metadata.ip);
    await this.cache.del(this.signupCacheKey(otpId));

    const normalizedEmail = this.normalizeEmail(pending.email);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ phone: pending.phone }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] },
    });
    if (existing) {
      throw new BadRequestException('User already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        name: pending.name,
        phone: pending.phone,
        email: normalizedEmail,
        password: pending.passwordHash,
      },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    const tokens = await this.issueTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      twoFaVerified: true,
    });
    await this.logSession(user.id, { ip: pending.ip ?? metadata.ip, userAgent: pending.userAgent ?? metadata.userAgent });
    this.logger.log({ msg: 'Signup success', userId: user.id, ip: metadata.ip ?? pending.ip });
    return { user, ...tokens };
  }

  // --- New signup session (Telegram-first) ---
  async signupStartSession(
    input: { phone: string; country: string; fullName: string },
    metadata: { ip?: string; userAgent?: string; correlationId?: string },
  ) {
    const phoneE164 = normalizePhoneToE164(input.phone);
    const exists = await this.prisma.user.findFirst({ where: { phone: phoneE164 }, select: { id: true } });
    if (exists) {
      return this.fail('PHONE_ALREADY_USED', 'Phone already registered');
    }
    const nonce = randomUUID().replace(/-/g, '');
    const { token, payload } = await this.signSignupSessionToken({
      phone: phoneE164,
      country: input.country?.trim() || 'EG',
      fullName: input.fullName?.trim() || 'User',
      nonce,
    });
    this.debugLog('signup.start-session', {
      correlationId: metadata.correlationId,
      phoneE164,
      expiresIn: this.signupSessionTtlSeconds,
    });
    return this.ok({
      signupSessionToken: token,
      expiresInSeconds: Math.max(1, payload.exp - payload.iat),
      next: { requiresTelegramLink: true, telegramOnly: true },
    });
  }

  async signupCreateLinkToken(signupSessionToken: string, correlationId?: string) {
    const session = await this.verifySignupSessionTokenOrThrow(signupSessionToken, correlationId);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remainingSeconds = Math.max(0, session.exp - nowSeconds);
    if (remainingSeconds <= 0) {
      throw new UnauthorizedException({ success: false, error: 'SESSION_INVALID', message: 'Signup session expired' });
    }
    const ttl = Math.min(this.linkTokenTtlSeconds, remainingSeconds);
    const { token: linkToken, exp } = this.createSignupLinkToken(session, ttl);
    this.debugLog('signup.link-token.write', {
      ttl,
      correlationId,
      sessionKey: this.signupSessionKey(session.nonce),
    });
    const expiresInSeconds = Math.max(1, exp - nowSeconds);
    return this.ok({
      linkToken: linkToken, // backward compatibility
      telegramLinkToken: linkToken,
      deeplink: `https://t.me/${this.config.get<string>('TELEGRAM_BOT_USERNAME') || 'FasketSuberBot'}?start=${linkToken}`,
      expiresInSeconds,
    });
  }

  async signupLinkStatus(signupSessionToken: string, correlationId?: string) {
    const session = await this.verifySignupSessionTokenOrThrow(signupSessionToken, correlationId);
    const link = await this.getSignupLink(session.nonce);
    const linked = Boolean(link);
    return this.ok({
      linked,
      telegramChatIdMasked: linked && link?.telegramChatId ? this.maskChatId(link.telegramChatId) : undefined,
    });
  }

  async signupConfirmLinkToken(linkToken: string, payload: { chatId: bigint; telegramUserId?: bigint; telegramUsername?: string }) {
    const decoded = await this.verifySignupLinkToken(linkToken);
    const sessionKey = decoded.sessionKey;
    const expiresAt = new Date(decoded.exp * 1000);
    await this.prisma.signupLink.upsert({
      where: { sessionKey },
      create: {
        sessionKey,
        telegramChatId: payload.chatId,
        telegramUserId: payload.telegramUserId ?? null,
        telegramUsername: payload.telegramUsername ?? null,
        expiresAt,
      },
      update: {
        telegramChatId: payload.chatId,
        telegramUserId: payload.telegramUserId ?? null,
        telegramUsername: payload.telegramUsername ?? null,
        expiresAt,
      },
    });
    this.debugLog('signup.link-token.confirmed', { sessionKey });
    return this.ok({ linked: true });
  }

  async signupRequestOtp(signupSessionToken: string, metadata: { ip?: string; correlationId?: string }) {
    const session = await this.verifySignupSessionTokenOrThrow(signupSessionToken, metadata.correlationId);
    const link = await this.getLinkedSignupSession(session.nonce);
    if (!link) {
      return this.fail('NOT_LINKED', 'من فضلك اربط حساب تيليجرام أولاً من خلال الرابط المرسل لإكمال التسجيل.');
    }
    const otp = this.generateOtpCode();
    const requestId = randomUUID();
    const expiresInSeconds = Number(this.config.get('OTP_TTL_SECONDS') ?? this.config.get('OTP_TTL_MIN') ?? 300);
    const hash = this.hashOtp(otp);
    await this.prisma.signupLink.update({
      where: { sessionKey: this.signupSessionKey(session.nonce) },
      data: {
        otpHash: hash,
        otpExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        otpAttempts: 0,
        requestId,
      },
    });
    const send = await this.telegram.sendSignupOtp({
      telegramChatId: link.telegramChatId,
      otp,
      expiresInSeconds,
      requestId,
    });
    if (!send.ok) {
      return this.fail('TELEGRAM_SEND_FAILED', 'Unable to send OTP via Telegram.');
    }
    return this.ok({
      channel: 'telegram',
      expiresInSeconds,
      requestId,
    });
  }

  async signupVerifySession(
    input: { signupSessionToken: string; otp: string },
    metadata: { ip?: string; userAgent?: string; correlationId?: string },
  ) {
    const session = await this.verifySignupSessionTokenOrThrow(input.signupSessionToken, metadata.correlationId);
    const sessionKey = this.signupSessionKey(session.nonce);
    const link = await this.getLinkedSignupSession(session.nonce);
    if (!link) {
      return this.fail('NOT_LINKED', 'من فضلك اربط حساب تيليجرام أولاً من خلال الرابط المرسل لإكمال التسجيل.');
    }
    if (!link.otpHash || !link.otpExpiresAt || link.otpExpiresAt.getTime() < Date.now()) {
      return this.fail('OTP_EXPIRED', 'OTP expired');
    }
    const attempts = (link.otpAttempts ?? 0) + 1;
    const maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
    const valid = this.hashOtp(input.otp?.trim()) === link.otpHash;

    if (!valid) {
      await this.prisma.signupLink.update({
        where: { sessionKey },
        data: { otpAttempts: attempts },
      });
      if (attempts >= maxAttempts) {
        await this.prisma.signupLink.update({
          where: { sessionKey },
          data: { otpExpiresAt: new Date(), otpHash: null },
        });
        return this.fail('OTP_TOO_MANY_ATTEMPTS', 'Too many attempts');
      }
      return this.fail('OTP_INVALID', 'Invalid OTP');
    }

    const existing = await this.prisma.user.findFirst({ where: { phone: session.phone }, select: { id: true } });
    if (existing) {
      return this.fail('PHONE_ALREADY_USED', 'Phone already registered');
    }

    const passwordHash = await bcrypt.hash(randomUUID(), this.bcryptRounds());
    const user = await this.prisma.user.create({
      data: { name: session.fullName ?? 'User', phone: session.phone, password: passwordHash },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    const tokens = await this.issueTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      twoFaVerified: true,
    });
    await this.logSession(user.id, { ip: metadata.ip, userAgent: metadata.userAgent });
    await this.prisma.signupLink.delete({ where: { sessionKey } }).catch(() => undefined);
    return this.ok({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 3600),
      user: { id: user.id, phoneE164: user.phone },
    });
  }

  async setupAdminTwoFa(userId: string) {
    const secret = this.generateSecret();
    const secretBase32 = this.toBase32(Buffer.from(secret, 'hex'));
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaSecret: secret, twoFaEnabled: false },
    });
    return {
      secret,
      secretBase32,
      otpauthUrl: `otpauth://totp/Fasket:${userId}?secret=${secretBase32}&issuer=Fasket`,
    };
  }

  async enableAdminTwoFa(userId: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFaSecret: true } });
    if (!user?.twoFaSecret) {
      throw new BadRequestException('2FA not initialized');
    }
    if (!this.verifyTotp(otp, user.twoFaSecret)) {
      throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Invalid 2FA code');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: true },
    });
    return { enabled: true };
  }

  async disableAdminTwoFa(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: false, twoFaSecret: null },
    });
    return { enabled: false };
  }

  async issueTokens(user: { id: string; role: string; phone: string; email?: string | null; twoFaVerified?: boolean }) {
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL') ?? 900;
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL') ?? 1209600;
    const jti = randomUUID();
    const accessPayload = {
      sub: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      twoFaVerified: user.twoFaVerified ?? true,
    };
    const access = await this.jwt.signAsync(accessPayload, {
      secret: accessSecret,
      expiresIn: accessTtl,
    });
    const refresh = await this.jwt.signAsync({ sub: user.id, jti }, {
      secret: refreshSecret,
      expiresIn: refreshTtl,
    });
    await this.cache.set(this.refreshCacheKey(user.id, jti), true, refreshTtl);
    return { accessToken: access, refreshToken: refresh };
  }

  async issueTokensForUserId(sub: string, previousJti?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { role: true, phone: true, email: true, twoFaEnabled: true },
    });
    if (!user) {
      this.logger.warn({ msg: 'Refresh token rejected - user missing', userId: sub });
      throw new UnauthorizedException('User not found');
    }
    if (previousJti) {
      const allowed = await this.cache.get<boolean>(this.refreshCacheKey(sub, previousJti));
      if (!allowed) {
        throw new UnauthorizedException('Refresh token reuse detected');
      }
      await this.cache.del(this.refreshCacheKey(sub, previousJti));
    }
    return this.issueTokens({
      id: sub,
      role: user.role,
      phone: user.phone,
      email: user.email ?? undefined,
      twoFaVerified: !user.twoFaEnabled,
    });
  }

  private async logSession(userId: string, metadata: { ip?: string; userAgent?: string }) {
    try {
      await this.prisma.sessionLog.create({
        data: {
          userId,
          ip: metadata.ip,
          userAgent: metadata.userAgent,
          device: buildDeviceInfo(metadata.userAgent) as any,
        },
      });
    } catch (error) {
      this.logger.warn(`Session log skipped for ${userId}: ${(error as Error).message}`);
    }
  }

  private generateSecret() {
    return randomBytes(20).toString('hex');
  }

  private toBase32(buffer: Buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let output = '';
    for (const byte of buffer) {
      bits += byte.toString(2).padStart(8, '0');
      while (bits.length >= 5) {
        const chunk = bits.slice(0, 5);
        bits = bits.slice(5);
        output += alphabet[parseInt(chunk, 2)];
      }
    }
    if (bits.length) {
      output += alphabet[parseInt(bits.padEnd(5, '0'), 2)];
    }
    return output;
  }

  private verifyTotp(token: string, secretHex: string) {
    if (!token || !secretHex) return false;
    const secret = Buffer.from(secretHex, 'hex');
    const step = 30;
    const counter = Math.floor(Date.now() / 1000 / step);
    for (let i = -1; i <= 1; i++) {
      const expected = this.generateTotp(secret, counter + i);
      if (expected === token) return true;
    }
    return false;
  }

  private generateTotp(secret: Buffer, counter: number) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', secret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const digits = code % 10 ** this.otpDigits;
    return digits.toString().padStart(this.otpDigits, '0');
  }

  private refreshCacheKey(userId: string, jti: string) {
    return `refresh:${userId}:${jti}`;
  }

  private signupCacheKey(otpId: string) {
    return `signup:pending:${otpId}`;
  }

  private normalizePhone(phone: string) {
    const trimmed = (phone || '').trim();
    const e164 = /^\+?[1-9]\d{7,14}$/;
    if (!e164.test(trimmed)) {
      throw new BadRequestException('Invalid phone');
    }
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  // --- signup session helpers ---
  private signupSessionKey(nonce: string) {
    return createHmac('sha256', this.signupSessionSecret()).update(nonce).digest('base64url').slice(0, 24);
  }

  private signupSessionSecret() {
    const secret =
      this.config.get<string>('SIGNUP_SESSION_SECRET') ??
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('SIGNUP_SESSION_SECRET is not configured');
    }
    return secret;
  }

  private async signSignupSessionToken(
    data: Omit<SignupSessionTokenPayload, 'iat' | 'exp'>,
  ): Promise<{ token: string; payload: SignupSessionTokenPayload }> {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.signupSessionTtlSeconds;
    const payload: SignupSessionTokenPayload = { ...data, iat, exp };
    const token = await this.jwt.signAsync(payload, { secret: this.signupSessionSecret() });
    return { token, payload };
  }

  private createSignupLinkToken(session: SignupSessionTokenPayload, ttlSeconds: number) {
    const sessionKey = this.signupSessionKey(session.nonce);
    const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(ttlSeconds));
    const payload = `${sessionKey}.${exp}`;
    const signature = createHmac('sha256', this.signupSessionSecret()).update(payload).digest('base64url').slice(0, 24);
    const token = `lt_${payload}.${signature}`;
    return { token, exp };
  }

  private async verifySignupSessionTokenOrThrow(token: string, correlationId?: string) {
    if (!token) {
      throw new UnauthorizedException({ success: false, error: 'SESSION_INVALID', message: 'Signup session token missing' });
    }
    try {
      const payload = await this.jwt.verifyAsync<SignupSessionTokenPayload>(token, {
        secret: this.signupSessionSecret(),
      });
      if (!payload?.nonce || !payload.phone) {
        throw new Error('SESSION_INVALID');
      }
      return payload;
    } catch (err) {
      this.logger.warn({
        msg: 'Signup session token invalid',
        correlationId,
        error: (err as Error)?.message,
      });
      throw new UnauthorizedException({
        success: false,
        error: 'SESSION_INVALID',
        message: 'Signup session expired or invalid',
      });
    }
  }

  private async verifySignupLinkToken(token: string): Promise<SignupLinkTokenPayload> {
    if (!token?.startsWith('lt_')) {
      throw new BadRequestException('TOKEN_INVALID');
    }
    const raw = token.replace(/^lt_/, '');
    const parts = raw.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('TOKEN_INVALID');
    }
    const [sessionKey, expStr, signature] = parts;
    const exp = Number(expStr);
    if (!sessionKey || !Number.isFinite(exp)) {
      throw new BadRequestException('TOKEN_INVALID');
    }
    const expectedSig = createHmac('sha256', this.signupSessionSecret())
      .update(`${sessionKey}.${exp}`)
      .digest('base64url')
      .slice(0, 24);
    if (signature !== expectedSig) {
      throw new BadRequestException('TOKEN_INVALID');
    }
    if (exp * 1000 < Date.now()) {
      throw new BadRequestException('TOKEN_EXPIRED');
    }
    return { sessionKey, exp };
  }

  private async getSignupLink(nonce: string): Promise<SignupLinkRecord | null> {
    const sessionKey = this.signupSessionKey(nonce);
    const record = await this.prisma.signupLink.findUnique({ where: { sessionKey } });
    if (!record) return null;
    if (record.expiresAt.getTime() < Date.now()) return null;
    return record as SignupLinkRecord;
  }

  private async getLinkedSignupSession(nonce: string): Promise<SignupLinkRecord | null> {
    const link = await this.getSignupLink(nonce);
    if (!link || !link.telegramChatId) return null;
    return link;
  }

  private maskChatId(chatId: bigint) {
    const s = chatId.toString();
    if (s.length <= 4) return '****';
    return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }

  private generateOtpCode() {
    const code = Math.floor(100000 + Math.random() * 900000);
    return code.toString().padStart(6, '0');
  }

  private hashOtp(otp: string) {
    const secret = this.config.get<string>('OTP_SECRET') ?? this.config.get<string>('JWT_ACCESS_SECRET') ?? 'otp-secret';
    return createHmac('sha256', secret).update(otp).digest('hex');
  }

  private ok<T extends Record<string, any>>(payload: T) {
    return { success: true, ...payload };
  }

  private fail(error: string, message: string) {
    return { success: false, error, message };
  }

  private debugLog(event: string, payload: Record<string, any>) {
    if (Date.now() > this.debugLogUntil) return;
    this.logger.debug({ event, ...payload });
  }

  async debugSignupSession(token: string) {
    try {
      const payload = await this.verifySignupSessionTokenOrThrow(token);
      const link = await this.getSignupLink(payload.nonce);
      return {
        valid: true,
        sessionKey: this.signupSessionKey(payload.nonce),
        payload,
        link: link
          ? {
              telegramChatId: link.telegramChatId?.toString?.() ?? link.telegramChatId,
              expiresAt: link.expiresAt,
              otpSet: Boolean(link.otpHash),
              otpExpiresAt: link.otpExpiresAt ?? undefined,
            }
          : null,
      };
    } catch (err) {
      return { valid: false, error: (err as Error)?.message };
    }
  }

  async revokeRefreshToken(userId: string, jti: string) {
    await this.cache.del(this.refreshCacheKey(userId, jti));
    return { success: true };
  }
}
