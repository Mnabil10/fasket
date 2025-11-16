import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { RequestContextService } from '../context/request-context.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly context: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      this.context.get('correlationId') ||
      (request.headers['x-correlation-id'] as string | undefined);
    const userId = this.context.get('userId');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        message = (res as any).message || message;
        details = (res as any).details ?? (res as any).errors;
        code = (res as any).code;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      Sentry.captureException(exception, {
        tags: { correlationId: correlationId || '', userId: userId || '' },
        extra: { path: request.path, method: request.method },
        user: userId ? { id: userId } : undefined,
      });
    }

    const logPayload = {
      correlationId,
      userId,
      path: request.path,
      method: request.method,
      status,
      code: code || `ERR_${status}`,
    };
    if (status >= 500) {
      this.logger.error({ ...logPayload, message }, (exception as any)?.stack);
    } else {
      this.logger.warn({ ...logPayload, message });
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json({
      success: false,
      error: {
        code: code || `ERR_${status}`,
        message,
        details,
      },
      correlationId,
    });
  }
}
