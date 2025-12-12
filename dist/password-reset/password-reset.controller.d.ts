import { Request } from 'express';
import { PasswordResetService } from './password-reset.service';
declare class PasswordResetRequestDto {
    phone: string;
}
declare class PasswordResetConfirmDto {
    resetToken: string;
    newPassword: string;
}
export declare class PasswordResetController {
    private readonly service;
    constructor(service: PasswordResetService);
    request(dto: PasswordResetRequestDto, req: Request): Promise<{
        otpId: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    confirm(dto: PasswordResetConfirmDto): Promise<{
        success: boolean;
    }>;
}
export {};
