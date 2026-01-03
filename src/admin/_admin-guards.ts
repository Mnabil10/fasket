import { CanActivate, ExecutionContext, ForbiddenException, UseGuards, applyDecorators } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TwoFaGuard } from '../common/guards/twofa.guard';


export const AdminOnly = () => applyDecorators(UseGuards(JwtAuthGuard, RolesGuard, TwoFaGuard), Roles('ADMIN'));
export const StaffOrAdmin = () => applyDecorators(UseGuards(JwtAuthGuard, RolesGuard, TwoFaGuard), Roles('ADMIN', 'STAFF'));
export const ProviderOrStaffOrAdmin = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard, TwoFaGuard), Roles('ADMIN', 'STAFF', 'PROVIDER'));
export class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const user = ctx.switchToHttp().getRequest().user;
      if (user?.role === 'ADMIN') return true;
      throw new ForbiddenException('Admin only');
    }
}
