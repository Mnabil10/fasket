import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryMode, ProviderStatus, ProviderType, ProviderUserRole, SignupSession as PrismaSignupSession, UserRole } from '@prisma/client';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { buildDeviceInfo } from '../common/utils/device.util';
import { DomainError, ErrorCode } from '../common/errors';
import { OtpService } from '../otp/otp.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import { TelegramService } from '../telegram/telegram.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AutomationEventsService } from '../automation/automation-events.service';
import { SlugService } from '../common/slug/slug.service';

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
  sessionId: string;
  phone: string;
  country: string;
  fullName?: string;
  iat: number;
  exp: number;
}

type SignupSessionStatus = 'PENDING_TELEGRAM' | 'TELEGRAM_LINKED' | 'OTP_REQUESTED' | 'COMPLETED';

interface SignupSession {
  id: string;
  phone: string;
  country: string;
  fullName?: string;
  createdAt: number;
  expiresAt: number;
  linked: boolean;
  status?: SignupSessionStatus;
  telegramChatId?: bigint;
  telegramUserId?: bigint;
  telegramUsername?: string;
  requestId?: string;
  otpHash?: string;
  otpExpiresAt?: number;
  otpAttempts?: number;
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
  private readonly automation: AutomationEventsService,
  private readonly slugs: SlugService,
) {}
  private readonly logger = new Logger(AuthService.name);
  private readonly otpDigits = 6;
  private readonly debugLogUntil = Date.now() + 10 * 60 * 1000;

  private get signupSessionTtlSeconds() {
    const ttl = Number(this.config.get('SIGNUP_SESSION_TTL_SECONDS') ?? this.config.get('SIGNUP_SESSION_TTL'));
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 900;
  }

  private normalizeEmail(email?: string | null) {
    return email ? email.trim().toLowerCase() : undefined;
  }

  private bcryptRounds() {
    const parsed = Number(this.config.get('BCRYPT_ROUNDS') ?? 12);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
  }

  async register(input: { name: string; phone: string; email?: string; password: string }) {
    const normalizedPhone = normalizePhoneToE164(input.phone);
    const normalizedEmail = this.normalizeEmail(input.email);
    const or: any[] = [{ phone: normalizedPhone }];
    if (normalizedEmail) or.push({ email: normalizedEmail });
    const exists = await this.prisma.user.findFirst({ where: { OR: or } });
    if (exists) throw new BadRequestException('User already exists');

    const hash = await bcrypt.hash(input.password, this.bcryptRounds());
    const user = await this.prisma.user.create({
      data: { name: input.name, phone: normalizedPhone, email: normalizedEmail, password: hash },
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

  async registerProvider(input: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    providerName: string;
    providerNameAr?: string;
    providerType?: ProviderType;
    branchName?: string;
    branchAddress?: string;
    branchCity?: string;
    branchRegion?: string;
  }) {
    const normalizedPhone = normalizePhoneToE164(input.phone);
    const normalizedEmail = this.normalizeEmail(input.email);
    const or: any[] = [{ phone: normalizedPhone }];
    if (normalizedEmail) or.push({ email: normalizedEmail });
    const exists = await this.prisma.user.findFirst({ where: { OR: or } });
    if (exists) throw new BadRequestException('User already exists');

    const providerName = input.providerName.trim();
    const providerSlug = await this.slugs.generateUniqueSlug('provider', providerName);
    const branchName = (input.branchName?.trim() || `${providerName} - Main`).trim();
    const branchSlug = await this.slugs.generateUniqueSlug('branch', branchName);
    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds());

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          phone: normalizedPhone,
          email: normalizedEmail,
          password: passwordHash,
          role: UserRole.PROVIDER,
        },
        select: { id: true, name: true, phone: true, email: true, role: true },
      });

      const provider = await tx.provider.create({
        data: {
          name: providerName,
          nameAr: input.providerNameAr?.trim() || undefined,
          slug: providerSlug,
          type: input.providerType ?? ProviderType.SUPERMARKET,
          status: ProviderStatus.PENDING,
          deliveryMode: DeliveryMode.PLATFORM,
          contactEmail: normalizedEmail ?? undefined,
          contactPhone: normalizedPhone,
        },
      });

      await tx.branch.create({
        data: {
          providerId: provider.id,
          name: branchName,
          slug: branchSlug,
          status: 'ACTIVE',
          isDefault: true,
          address: input.branchAddress?.trim() || undefined,
          city: input.branchCity?.trim() || undefined,
          region: input.branchRegion?.trim() || undefined,
        },
      });

      await tx.providerUser.create({
        data: {
          providerId: provider.id,
          userId: user.id,
          role: ProviderUserRole.OWNER,
        },
      });

      return { user, provider };
    });

    return {
      ok: true,
      providerId: result.provider.id,
      providerStatus: result.provider.status,
    };
  }

  async login(
    input: { identifier: string; password: string; otp?: string },
    metadata: { ip?: string; userAgent?: string },
  ) {
    const identifier = input.identifier?.trim();
    if (!identifier) {
      this.logger.warn({ msg: 'Login failed - empty identifier', ip: metadata.ip });
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }
    await this.rateLimiter.ensureCanAttempt(identifier, metadata.ip);
    const normalizedEmail = this.normalizeEmail(identifier);
    let normalizedPhone: string | null = null;
    try {
      normalizedPhone = normalizePhoneToE164(identifier);
    } catch {
      normalizedPhone = null;
    }
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: identifier },
          ...(normalizedPhone && normalizedPhone !== identifier ? [{ phone: normalizedPhone }] : []),
          { email: identifier },
          ...(normalizedEmail && normalizedEmail !== identifier ? [{ email: normalizedEmail }] : []),
        ],
      },
    });
    if (!user) {
      await this.rateLimiter.trackFailure(identifier, metadata.ip);
      this.logger.warn({ msg: 'Login failed - user not found', identifier, ip: metadata.ip });
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }
    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) {
      await this.rateLimiter.trackFailure(identifier, metadata.ip);
      this.logger.warn({ msg: 'Login failed - bad password', userId: user.id, ip: metadata.ip });
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
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

    if (user.role === UserRole.PROVIDER) {
      const membership = await this.prisma.providerUser.findFirst({
        where: { userId: user.id },
        include: { provider: { select: { id: true, status: true } } },
      });
      if (!membership) {
        throw new DomainError(ErrorCode.AUTH_ACCOUNT_DISABLED, 'Provider account is not linked');
      }
      if (membership.provider.status !== ProviderStatus.ACTIVE) {
        throw new DomainError(ErrorCode.AUTH_ACCOUNT_DISABLED, 'Provider account pending approval');
      }
    }
    if (user.role === UserRole.DRIVER) {
      const driver = await this.prisma.deliveryDriver.findFirst({
        where: { userId: user.id },
        select: { id: true, isActive: true },
      });
      if (!driver) {
        throw new DomainError(ErrorCode.AUTH_ACCOUNT_DISABLED, 'Driver account is not linked');
      }
      if (!driver.isActive) {
        throw new DomainError(ErrorCode.AUTH_ACCOUNT_DISABLED, 'Driver account is disabled');
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

  async loginWithOtp(
    input: { phone: string; otp: string },
    metadata: { ip?: string; userAgent?: string },
  ) {
    const rawPhone = input.phone?.trim();
    const otp = input.otp?.trim();
    if (!rawPhone || !otp) {
      throw new BadRequestException('Phone and OTP are required');
    }
    const normalizedPhone = normalizePhoneToE164(rawPhone);
    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    const requireAdmin2fa = (this.config.get<string>('AUTH_REQUIRE_ADMIN_2FA') ?? 'false') === 'true';
    if (user.role === UserRole.ADMIN && requireAdmin2fa) {
      throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Two-factor authentication required');
    }

    const result = await this.otp.verifyOtpLegacy(normalizedPhone, 'LOGIN', otp, metadata.ip);
    const tokens = (result as any)?.tokens;
    if (!tokens?.accessToken) {
      throw new UnauthorizedException({
        code: ErrorCode.OTP_INVALID,
        message: 'Invalid OTP',
      });
    }

    const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
    await this.logSession(user.id, metadata);
    this.logger.log({ msg: 'Login OTP success', userId: user.id, ip: metadata.ip });
    return { user: safeUser, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
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
    const sessionId = `sess_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = Date.now() + this.signupSessionTtlSeconds * 1000;
    await this.prisma.signupSession.create({
      data: {
        id: sessionId,
        phone: phoneE164,
        country: input.country?.trim() || 'EG',
        fullName: input.fullName?.trim() || 'User',
        createdAt: new Date(),
        expiresAt: new Date(expiresAt),
        status: 'PENDING_TELEGRAM',
      },
    });
    const session: SignupSession = {
      id: sessionId,
      phone: phoneE164,
      country: input.country?.trim() || 'EG',
      fullName: input.fullName?.trim() || 'User',
      createdAt: Date.now(),
      expiresAt,
      linked: false,
      status: 'PENDING_TELEGRAM',
      otpAttempts: 0,
    };
    const { token, payload } = await this.signSignupSessionToken({
      sessionId,
      phone: session.phone,
      country: session.country,
      fullName: session.fullName,
    });
    this.debugLog('signup.start-session', {
      correlationId: metadata.correlationId,
      phoneE164,
      expiresIn: this.signupSessionTtlSeconds,
    });
    return this.ok({
      signupSessionId: sessionId,
      signupSessionToken: token,
      expiresInSeconds: Math.max(1, payload.exp - payload.iat),
      next: { requiresTelegramLink: true, telegramOnly: true },
    });
  }

  async signupCreateLinkToken(
    ref: { signupSessionId?: string; signupSessionToken?: string },
    correlationId?: string,
  ) {
    const { session, sessionId } = await this.resolveSignupSession(ref, correlationId);
    return this.ok({
      linkToken: '',
      telegramLinkToken: '',
      deeplink: `https://t.me/${this.config.get<string>('TELEGRAM_BOT_USERNAME') || 'FasketSuberBot'}`,
      expiresInSeconds: this.signupSessionTtlSeconds,
    });
  }

  async signupLinkStatus(ref: { signupSessionId?: string; signupSessionToken?: string }, correlationId?: string) {
    const { session } = await this.resolveSignupSession(ref, correlationId);
    return this.ok({
      linked: Boolean(session.telegramChatId),
      telegramChatIdMasked: session.telegramChatId ? this.maskChatId(session.telegramChatId) : undefined,
    });
  }

  async signupConfirmLinkToken(
    _linkToken: string | undefined,
    payload: { chatId: bigint; telegramUserId?: bigint; telegramUsername?: string },
    ref?: { signupSessionId?: string; signupSessionToken?: string },
  ) {
    let session: SignupSession | null = null;
    try {
      if (ref?.signupSessionId || ref?.signupSessionToken) {
        const resolved = await this.resolveSignupSession(
          { signupSessionId: ref.signupSessionId, signupSessionToken: ref.signupSessionToken },
          undefined,
        );
        session = resolved.session;
      }
    } catch {
      session = null;
    }
    if (!session) {
      session = await this.findLatestPendingSignupSession();
    }
    if (!session) {
      return this.fail('SESSION_NOT_FOUND', 'No pending signup session found');
    }

    if (session.telegramChatId && session.telegramChatId !== payload.chatId) {
      return this.fail('CHAT_ALREADY_LINKED', 'Signup session already linked to another Telegram chat');
    }

    // Idempotent: if already linked to same chat, just return success
    if (session.telegramChatId && session.telegramChatId === payload.chatId) {
      return this.ok({ signupSessionId: session.id, linked: true });
    }

    const updated = await this.prisma.signupSession.updateMany({
      where: {
        id: session.id,
        status: { in: ['PENDING_TELEGRAM', 'TELEGRAM_LINKED', 'OTP_REQUESTED'] },
        expiresAt: { gt: new Date() },
      },
      data: {
        telegramChatId: payload.chatId,
        telegramUserId: payload.telegramUserId ?? null,
        telegramUsername: payload.telegramUsername ?? null,
        status: 'TELEGRAM_LINKED',
      },
    });
    if (!updated.count) {
      return this.fail('SESSION_NOT_FOUND', 'No pending signup session found');
    }
    return this.ok({ signupSessionId: session.id, linked: true });
  }

  async signupRequestOtp(ref: { signupSessionId?: string; signupSessionToken?: string }, metadata: { ip?: string; correlationId?: string }) {
    const { session, sessionId } = await this.resolveSignupSession(ref, metadata.correlationId);
    if (!session.linked || !session.telegramChatId) {
      throw new ConflictException({
        success: false,
        error: 'TELEGRAM_NOT_LINKED',
        message: 'TELEGRAM_NOT_LINKED',
      });
    }
    const otp = this.generateOtpCode();
    const requestId = randomUUID();
    const expiresInSeconds = this.resolveOtpTtlSeconds();
    const hash = this.hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await this.prisma.signupSession.update({
      where: { id: sessionId },
      data: {
        otpHash: hash,
        otpExpiresAt,
        otpAttempts: 0,
        requestId,
        status: 'OTP_REQUESTED',
      },
    });
    const delivery = await this.dispatchSignupOtpAutomation({
      session,
      otp,
      expiresInSeconds,
      requestId,
    });
    if (!delivery) {
      return this.fail('OTP_DELIVERY_FAILED', 'Unable to send OTP at this time.');
    }
    return this.ok({
      channel: 'telegram',
      expiresInSeconds,
      requestId,
    });
  }

  private async dispatchSignupOtpAutomation(params: {
    session: SignupSession;
    otp: string;
    expiresInSeconds: number;
    requestId: string;
  }) {
    try {
      const chatId = params.session.telegramChatId ? this.toAutomationChatId(params.session.telegramChatId) : undefined;
      if (!chatId) return false;
      await this.automation.emit(
        'auth.otp.requested',
        {
          phone: params.session.phone,
          otpId: params.requestId,
          purpose: 'SIGNUP',
          otp: params.otp,
          expiresInSeconds: params.expiresInSeconds,
          channel: 'fallback',
          telegramChatId: chatId,
          requestId: params.requestId,
        },
        { id: params.requestId },
      );
      return true;
    } catch (err) {
      this.logger.warn({
        msg: 'Signup OTP automation dispatch failed',
        error: (err as Error)?.message,
        sessionId: params.session.id,
        requestId: params.requestId,
      });
      return false;
    }
  }

  async signupVerifySession(
    input: { signupSessionId?: string; signupSessionToken?: string; otp: string },
    metadata: { ip?: string; userAgent?: string; correlationId?: string },
  ) {
    const { session, sessionId } = await this.resolveSignupSession(
      { signupSessionId: input.signupSessionId, signupSessionToken: input.signupSessionToken },
      metadata.correlationId,
    );
    if (!session.linked || !session.telegramChatId) {
      return this.fail('NOT_LINKED', 'Please link your Telegram account first.');
    }
    if (!session.otpHash || !session.otpExpiresAt || session.otpExpiresAt < Date.now()) {
      return this.fail('OTP_EXPIRED', 'OTP expired');
    }
    const attempts = (session.otpAttempts ?? 0) + 1;
    const maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
    const valid = this.hashOtp(input.otp?.trim()) === session.otpHash;

    if (!valid) {
      await this.prisma.signupSession.update({
        where: { id: sessionId },
        data: {
          otpAttempts: attempts,
          ...(attempts >= maxAttempts
            ? { otpExpiresAt: new Date(), otpHash: null, status: 'TELEGRAM_LINKED' }
            : {}),
        },
      });
      if (attempts >= maxAttempts) {
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
    await this.prisma.signupSession
      .update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
        },
      })
      .catch(() => undefined);
    const accessTtl = Number(
      this.config.get('JWT_ACCESS_TTL_SECONDS') ??
        this.config.get('JWT_ACCESS_TTL') ??
        900,
    );
    return this.ok({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: Number.isFinite(accessTtl) && accessTtl > 0 ? accessTtl : 900,
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
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not configured');
    }
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new InternalServerErrorException('JWT_REFRESH_SECRET is not configured');
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
    if (user.role === UserRole.PROVIDER) {
      const membership = await this.prisma.providerUser.findFirst({
        where: { userId: sub },
        include: { provider: { select: { status: true } } },
      });
      if (!membership || membership.provider.status !== ProviderStatus.ACTIVE) {
        throw new UnauthorizedException('Provider account disabled');
      }
    }
    if (user.role === UserRole.DRIVER) {
      const driver = await this.prisma.deliveryDriver.findFirst({
        where: { userId: sub },
        select: { id: true, isActive: true },
      });
      if (!driver || !driver.isActive) {
        throw new UnauthorizedException('Driver account disabled');
      }
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
  private signupSessionSecret() {
    const secret =
      this.config.get<string>('SIGNUP_SESSION_SECRET') ??
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('SIGNUP_SESSION_SECRET is not configured');
    }
    return secret;
  }

  private mapDbSignupSession(db: PrismaSignupSession): SignupSession {
    return {
      id: db.id,
      phone: db.phone,
      country: db.country,
      fullName: db.fullName ?? undefined,
      createdAt: db.createdAt.getTime(),
      expiresAt: db.expiresAt.getTime(),
      linked: Boolean(db.telegramChatId),
      status: db.status as SignupSessionStatus,
      telegramChatId: db.telegramChatId ?? undefined,
      telegramUserId: db.telegramUserId ?? undefined,
      telegramUsername: db.telegramUsername ?? undefined,
      requestId: db.requestId ?? undefined,
      otpHash: db.otpHash ?? undefined,
      otpExpiresAt: db.otpExpiresAt ? db.otpExpiresAt.getTime() : undefined,
      otpAttempts: db.otpAttempts ?? undefined,
    };
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

  private async verifySignupSessionTokenOrThrow(token: string, correlationId?: string) {
    if (!token) {
      throw new UnauthorizedException({ success: false, error: 'SESSION_EXPIRED', message: 'Signup session token missing' });
    }
    try {
      const payload = await this.jwt.verifyAsync<SignupSessionTokenPayload>(token, {
        secret: this.signupSessionSecret(),
      });
      if (!payload?.sessionId || !payload.phone) {
        throw new UnauthorizedException({
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'Signup session expired or invalid',
        });
      }
      return payload;
    } catch (err) {
      this.logger.warn({
        msg: 'Signup session token invalid',
        correlationId,
        error: (err as Error)?.message,
      });
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException({
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Signup session expired or invalid',
      });
    }
  }

  private async resolveSignupSession(
    ref: { signupSessionId?: string; signupSessionToken?: string },
    correlationId?: string,
  ): Promise<{ sessionId: string; session: SignupSession }> {
    const sessionId = ref.signupSessionId?.trim();
    if (sessionId) {
      const session = await this.getSignupSessionOrThrow(sessionId, correlationId);
      return { sessionId, session };
    }
    if (ref.signupSessionToken) {
      const payload = await this.verifySignupSessionTokenOrThrow(ref.signupSessionToken, correlationId);
      const session = await this.getSignupSessionOrThrow(payload.sessionId, correlationId);
      return { sessionId: payload.sessionId, session };
    }
    throw new UnauthorizedException({ success: false, error: 'SESSION_EXPIRED', message: 'Signup session expired' });
  }

  private async findLatestPendingSignupSession(): Promise<SignupSession | null> {
    const record = await this.prisma.signupSession.findFirst({
      where: {
        status: 'PENDING_TELEGRAM',
        telegramChatId: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return record ? this.mapDbSignupSession(record) : null;
  }

  private async getSignupSessionOrThrow(id: string, correlationId?: string): Promise<SignupSession> {
    const record = await this.prisma.signupSession.findUnique({ where: { id } });
    this.debugLog('signup.session.read', { sessionId: id, found: Boolean(record), correlationId });
    if (!record) {
      throw new NotFoundException({ success: false, error: 'SESSION_NOT_FOUND', message: 'Signup session not found' });
    }
    const session = this.mapDbSignupSession(record);
    if (session.expiresAt < Date.now()) {
      throw new UnauthorizedException({ success: false, error: 'SESSION_EXPIRED', message: 'Signup session expired' });
    }
    return session;
  }

  private maskChatId(chatId: bigint) {
    const s = chatId.toString();
    if (s.length <= 4) return '****';
    return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }

  private toAutomationChatId(chatId: bigint) {
    const asNumber = Number(chatId);
    return Number.isSafeInteger(asNumber) ? asNumber : chatId.toString();
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
        this.logger.warn({ msg: 'OTP TTL too low in production; falling back to default', configuredSeconds });
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

  async debugSignupSession(ref: { signupSessionId?: string; signupSessionToken?: string }) {
    try {
      const { sessionId, session } = await this.resolveSignupSession(ref);
      return { valid: true, sessionId, session };
    } catch (err) {
      return { valid: false, error: (err as Error)?.message };
    }
  }

  async revokeRefreshToken(userId: string, jti: string) {
    await this.cache.del(this.refreshCacheKey(userId, jti));
    return { success: true };
  }
}
