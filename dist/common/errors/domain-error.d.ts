import { ErrorCode } from './error-codes';
export declare class DomainError extends Error {
    readonly code: ErrorCode;
    readonly userMessage: string;
    readonly httpStatus: number;
    readonly details?: Record<string, any> | undefined;
    constructor(code: ErrorCode, userMessage: string, httpStatus?: number, details?: Record<string, any> | undefined);
}
