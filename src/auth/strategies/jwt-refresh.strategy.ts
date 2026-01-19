import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    const cookieName = config.get<string>('AUTH_REFRESH_COOKIE_NAME') || 'refreshToken';
    const refreshTokenExtractor = (req: Request) => {
      if (!req) return null;
      const headerToken = req.headers['x-refresh-token'];
      const parsedCookies = parseCookieHeader(req.headers?.cookie);
      const cookieToken =
        (req as any)?.cookies?.[cookieName] ??
        (req as any)?.signedCookies?.[cookieName] ??
        parsedCookies?.[cookieName];
      const bodyToken = (req.body as any)?.refreshToken;
      const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
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
  async validate(payload: { sub: string; jti?: string }) {
    return { userId: payload.sub, jti: payload.jti };
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
