import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  private readonly logger = new Logger(InternalSecretGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret =
      this.config.get<string>('INTERNAL_TELEGRAM_SECRET') ||
      this.config.get<string>('INTERNAL_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      '';
    if (!secret) {
      this.logger.error('INTERNAL_SECRET is not configured');
      throw new UnauthorizedException('Internal access denied');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.normalizeHeader(request.headers['x-internal-secret']);
    if (!provided || !this.safeCompare(provided, secret)) {
      throw new UnauthorizedException('Forbidden');
    }
    return true;
  }

  private normalizeHeader(value: string | string[] | undefined) {
    if (!value) return '';
    return Array.isArray(value) ? value[0] : value;
  }

  private safeCompare(a: string, b: string) {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
}
