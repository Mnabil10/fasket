import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { buildDeviceInfo } from '../common/utils/device.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly rateLimiter: AuthRateLimitService,
    private readonly config: ConfigService,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  private normalizeEmail(email?: string | null) {
    return email ? email.trim().toLowerCase() : undefined;
  }

  async register(input: { name: string; phone: string; email?: string; password: string }) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const or: any[] = [{ phone: input.phone }];
    if (normalizedEmail) or.push({ email: normalizedEmail });
    const exists = await this.prisma.user.findFirst({ where: { OR: or } });
    if (exists) throw new BadRequestException('User already exists');

    const hash = await bcrypt.hash(input.password, 10);
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
    input: { identifier: string; password: string },
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
    await this.rateLimiter.reset(identifier, metadata.ip);
    const tokens = await this.issueTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
    });
    const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
    await this.logSession(user.id, metadata);
    this.logger.log({ msg: 'Login success', userId: user.id, ip: metadata.ip });
    return { user: safeUser, ...tokens };
  }

  async issueTokens(user: { id: string; role: string; phone: string; email?: string | null }) {
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
    const accessPayload = {
      sub: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email,
    };
    const access = await this.jwt.signAsync(accessPayload, {
      secret: accessSecret,
      expiresIn: accessTtl,
    });
    const refresh = await this.jwt.signAsync({ sub: user.id }, {
      secret: refreshSecret,
      expiresIn: refreshTtl,
    });
    return { accessToken: access, refreshToken: refresh };
  }

  async issueTokensForUserId(sub: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { role: true, phone: true, email: true },
    });
    if (!user) {
      this.logger.warn({ msg: 'Refresh token rejected - user missing', userId: sub });
      throw new UnauthorizedException('User not found');
    }
    return this.issueTokens({
      id: sub,
      role: user.role,
      phone: user.phone,
      email: user.email ?? undefined,
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
}
