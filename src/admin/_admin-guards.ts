import { CanActivate, ExecutionContext, ForbiddenException, UseGuards, applyDecorators } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';


export const AdminOnly = () => applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles('ADMIN'));
export const StaffOrAdmin = () => applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles('ADMIN', 'STAFF'));
export class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const user = ctx.switchToHttp().getRequest().user;
      if (user?.role === 'ADMIN') return true;
      throw new ForbiddenException('Admin only');
    }
}
