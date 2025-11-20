import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly userMessage: string,
    public readonly httpStatus: number = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, any>,
  ) {
    super(userMessage);
    this.name = 'DomainError';
  }
}
