import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestContextService } from '../context/request-context.service';
import { SKIP_RESPONSE_WRAPPER } from '../decorators/skip-response-wrapper.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly context: RequestContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const skipWrapper = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAPPER, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (skipWrapper) {
          return data;
        }
        const correlationId = this.context.get('correlationId');
        if (data && typeof data === 'object' && 'success' in data) {
          return { ...data, correlationId };
        }
        return { success: true, data, correlationId };
      }),
    );
  }
}
