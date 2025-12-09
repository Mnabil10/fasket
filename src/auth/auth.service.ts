import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly rateLimiter: AuthRateLimitService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}
  private readonly logger = new Logger(AuthService.name);
  private readonly otpDigits = 6;

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

    const requireAdmin2fa = (this.config.get<string>('AUTH_REQUIRE_ADMIN_2FA') ?? 'true') === 'true';
    const staticAdminOtp = this.config.get<string>('AUTH_ADMIN_STATIC_OTP') || '1234';
    let twoFaVerified = !user.twoFaEnabled;

    if (user.role === 'ADMIN') {
      if (!requireAdmin2fa) {
        twoFaVerified = true;
      } else if (staticAdminOtp) {
        if (input.otp !== staticAdminOtp) {
          throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Two-factor authentication required');
        }
        twoFaVerified = true;
      } else {
        if (!user.twoFaEnabled) {
          throw new DomainError(ErrorCode.AUTH_2FA_REQUIRED, 'Admin accounts must enable two-factor authentication');
        }
        if (!input.otp || !this.verifyTotp(input.otp, user.twoFaSecret ?? '')) {
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
}
