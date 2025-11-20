import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { RequestContextService } from '../context/request-context.service';
import { DomainError, ErrorCode } from '../errors';

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
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      message = exception.userMessage;
      code = exception.code;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        let responseMessage = (res as any).message;
        if (Array.isArray(responseMessage)) {
          details = { errors: responseMessage };
          responseMessage = 'Validation failed';
        } else {
          details = (res as any).details ?? (res as any).errors;
        }
        message = responseMessage || message;
        if ((res as any).code && Object.values(ErrorCode).includes((res as any).code)) {
          code = (res as any).code as ErrorCode;
        }
        if (!code && status === HttpStatus.BAD_REQUEST) {
          code = ErrorCode.VALIDATION_FAILED;
        }
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
      code: code || ErrorCode.INTERNAL_ERROR,
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
      error: { code, message },
      code, // legacy field for backward compatibility
      message, // legacy field for backward compatibility
      details,
      correlationId,
    });
  }
}
