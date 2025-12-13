import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAutomationSignature } from './hmac.util';
import { Request } from 'express';

@Injectable()
export class AutomationHmacGuard implements CanActivate {
  private readonly logger = new Logger(AutomationHmacGuard.name);
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = this.config.get<string>('AUTOMATION_HMAC_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Automation secret not configured');
    }

    const allowedIps = (this.config.get<string>('AUTOMATION_ALLOWED_IPS') ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    const clientIp = (req.ip || '').replace('::ffff:', '');
    const env = (this.config.get<string>('NODE_ENV') ?? '').toLowerCase();
    const prodLike = env === 'production' || env === 'staging';
    if (prodLike && allowedIps.length === 0) {
      this.logger.error('Automation IP allowlist required but missing');
      throw new ForbiddenException('IP allowlist required for automation');
    }
    if (allowedIps.length && !allowedIps.includes(clientIp)) {
      throw new ForbiddenException('IP not allowed');
    }

    const timestamp = Number(req.headers['x-fasket-timestamp'] ?? req.headers['x-automation-timestamp']);
    const signature = String(req.headers['x-fasket-signature'] ?? '');
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});

    const valid = verifyAutomationSignature(secret, { signature, timestamp }, rawBody, 300);
    if (!valid) {
      throw new UnauthorizedException('Invalid automation signature');
    }
    return true;
  }
}
