import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
export declare class AllExceptionsFilter implements ExceptionFilter {
    private readonly context;
    private readonly logger;
    constructor(context: RequestContextService);
    catch(exception: unknown, host: ArgumentsHost): void;
}
