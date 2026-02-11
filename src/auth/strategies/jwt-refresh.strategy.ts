import { Inject, Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService, @Inject(CACHE_MANAGER) cache: Cache) {
    const logger = new Logger(JwtRefreshStrategy.name);
    const secret = config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    const cookieName = config.get<string>('AUTH_REFRESH_COOKIE_NAME') || 'refreshToken';
    const trackMissingHeader = async (source: string) => {
      const day = new Date().toISOString().slice(0, 10);
      const ttlMs = 48 * 60 * 60 * 1000;
      const keys = [
        `metrics:auth:refresh:missing-header:${day}`,
        `metrics:auth:refresh:missing-header:${source}:${day}`,
      ];
      for (const key of keys) {
        const current = (await cache.get<number>(key)) ?? 0;
        await cache.set(key, current + 1, ttlMs);
      }
    };
    const refreshTokenExtractor = (req: Request) => {
      if (!req) return null;
      const headerToken = req.headers['x-refresh-token'];
      const hasHeaderToken =
        typeof headerToken === 'string'
          ? headerToken.trim().length > 0
          : Array.isArray(headerToken)
            ? headerToken.length > 0
            : false;
      const parsedCookies = parseCookieHeader(req.headers?.cookie);
      const cookieToken =
        (req as any)?.cookies?.[cookieName] ??
        (req as any)?.signedCookies?.[cookieName] ??
        parsedCookies?.[cookieName];
      const bodyToken = (req.body as any)?.refreshToken;
      const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      if (!hasHeaderToken && (bodyToken || cookieToken || bearerToken)) {
        const correlationId = req.headers['x-correlation-id'] || req.headers['x-correlationid'];
        const source = bodyToken ? 'body' : cookieToken ? 'cookie' : bearerToken ? 'authorization' : 'unknown';
        logger.warn({
          msg: 'Refresh token provided without x-refresh-token header',
          source,
          correlationId,
          ip: req.ip,
        });
        void trackMissingHeader(source).catch(() => undefined);
      }
      // Prefer refresh-specific carriers before falling back to Authorization
      if (typeof headerToken === 'string') return headerToken;
      if (Array.isArray(headerToken)) return headerToken[0];
      return bodyToken || cookieToken || bearerToken;
    };
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshTokenExtractor]),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }
  async validate(payload: { sub: string; jti?: string; twoFaVerified?: boolean }) {
    return { userId: payload.sub, jti: payload.jti, twoFaVerified: payload.twoFaVerified };
  }
}

function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rawValue.join('=').trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}
