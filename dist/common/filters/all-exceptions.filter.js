"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const Sentry = require("@sentry/node");
const crypto_1 = require("crypto");
const request_context_service_1 = require("../context/request-context.service");
const errors_1 = require("../errors");
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor(context) {
        this.context = context;
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const correlationId = this.context.get('correlationId') ||
            request.headers['x-correlation-id'] ||
            (0, crypto_1.randomUUID)();
        const userId = this.context.get('userId');
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let details;
        let code = errors_1.ErrorCode.INTERNAL_ERROR;
        if (exception instanceof errors_1.DomainError) {
            status = exception.httpStatus;
            message = exception.userMessage;
            code = exception.code;
            details = exception.details;
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            }
            else if (typeof res === 'object') {
                const responseBody = res;
                const rawMessage = responseBody.message;
                const validationErrors = Array.isArray(rawMessage) ? rawMessage : responseBody.errors;
                if (Array.isArray(validationErrors) && validationErrors.length > 0) {
                    details = { errors: validationErrors };
                    message = 'Validation failed';
                }
                else {
                    details = responseBody.details ?? responseBody.errors;
                    message = (typeof rawMessage === 'string' && rawMessage) || message;
                }
                if (responseBody.code && Object.values(errors_1.ErrorCode).includes(responseBody.code)) {
                    code = responseBody.code;
                }
                if (!code && status === common_1.HttpStatus.BAD_REQUEST) {
                    code = errors_1.ErrorCode.VALIDATION_FAILED;
                }
            }
            else {
                message = exception.message;
            }
        }
        else if (exception instanceof Error) {
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
            code: code || errors_1.ErrorCode.INTERNAL_ERROR,
        };
        if (status >= 500) {
            this.logger.error({ ...logPayload, message }, exception?.stack);
        }
        else {
            this.logger.warn({ ...logPayload, message });
        }
        if (response.headersSent) {
            return;
        }
        response.setHeader('x-correlation-id', correlationId);
        response.status(status).json({
            success: false,
            code: code || errors_1.ErrorCode.INTERNAL_ERROR,
            message,
            details,
            correlationId,
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [request_context_service_1.RequestContextService])
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map