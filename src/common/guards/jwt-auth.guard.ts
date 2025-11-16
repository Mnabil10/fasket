import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly context: RequestContextService) {
    super();
  }

  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest();
    if (user?.userId) this.context.set('userId', user.userId);
    if (user?.role) this.context.set('role', user.role);
    if (user?.phone) this.context.set('phone', user.phone);
    if (user?.email) this.context.set('email', user.email);
    if (request?.ip) {
      this.context.set('ip', request.ip);
    }
    return super.handleRequest(err, user, info, ctx);
  }
}
