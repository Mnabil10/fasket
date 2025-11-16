import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const correlationId = this.context.get('correlationId');
        if (data && typeof data === 'object' && 'success' in data) {
          return { ...data, correlationId };
        }
        return { success: true, data, correlationId };
      }),
    );
  }
}
