import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  private readonly logger = new Logger(InternalSecretGuard.name);
  private readonly placeholder = 'PUT_A_STRONG_SECRET_HERE';
  private readonly secret: string;
  private readonly altSecret?: string;
  private readonly failOnMissing: boolean;

  constructor(private readonly config: ConfigService) {
    const env = (this.config.get<string>('NODE_ENV') || '').toLowerCase();
    const internalSecret =
      this.config.get<string>('INTERNAL_TELEGRAM_SECRET') ||
      this.config.get<string>('INTERNAL_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      '';
    this.secret = internalSecret;
    this.altSecret = this.config.get<string>('N8N_SECRET') || undefined;
    this.failOnMissing = env === 'production';

    if (!this.secret || this.secret === this.placeholder) {
      const msg = 'INTERNAL_TELEGRAM_SECRET is not configured or uses placeholder';
      if (this.failOnMissing) {
        this.logger.error(msg);
        // Fail fast in production to avoid broken internal auth
        process.exit(1);
      } else {
        this.logger.warn(msg);
      }
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const correlationId = request.headers['x-correlation-id'] || request.headers['x-correlationid'];
    const providedPrimary = this.normalizeHeader(request.headers['x-internal-secret']);
    const providedAlt = this.normalizeHeader(request.headers['x-n8n-secret']);
    const provided = providedPrimary || providedAlt;

    const match =
      (provided && this.secret && this.safeCompare(provided, this.secret)) ||
      (provided && this.altSecret && this.safeCompare(provided, this.altSecret));

    if (!match) {
      this.logger.warn({
        msg: 'Internal secret invalid',
        correlationId,
        providedHeader: providedPrimary ? 'x-internal-secret' : providedAlt ? 'x-n8n-secret' : 'none',
      });
      throw new UnauthorizedException({ code: 'INTERNAL_SECRET_INVALID', message: 'Internal access denied' });
    }

    this.logger.debug({ msg: 'Internal secret accepted', correlationId });
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
