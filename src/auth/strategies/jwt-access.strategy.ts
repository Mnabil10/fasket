import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }
  async validate(payload: { sub: string; role: string; phone: string; email?: string | null }): Promise<CurrentUserPayload> {
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      phone: payload.phone,
      email: payload.email ?? undefined,
    };
  }
}
