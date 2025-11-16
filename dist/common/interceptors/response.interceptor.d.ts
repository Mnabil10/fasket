import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
export declare class ResponseInterceptor implements NestInterceptor {
    private readonly context;
    constructor(context: RequestContextService);
    intercept(_context: ExecutionContext, next: CallHandler): Observable<any>;
}
