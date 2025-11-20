import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class TwoFaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as any;
    if (user?.twoFaVerified === false) {
      throw new UnauthorizedException('Two-factor authentication required');
    }
    return true;
  }
}
