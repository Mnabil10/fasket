import { Request } from 'express';
import { OtpService, OtpPurpose } from './otp.service';
declare class OtpRequestDto {
    phone: string;
    purpose: OtpPurpose;
}
declare class OtpVerifyDto {
    phone: string;
    purpose: OtpPurpose;
    otpId: string;
    otp: string;
}
export declare class OtpController {
    private readonly otp;
    constructor(otp: OtpService);
    request(dto: OtpRequestDto, req: Request): Promise<{
        otpId: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    verify(dto: OtpVerifyDto, req: Request): Promise<{
        success: boolean;
        tokens: {
            accessToken: string;
            refreshToken: string;
        };
        resetToken?: undefined;
        expiresInSeconds?: undefined;
    } | {
        success: boolean;
        resetToken: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
        tokens?: undefined;
    } | {
        success: boolean;
        tokens?: undefined;
        resetToken?: undefined;
        expiresInSeconds?: undefined;
    }>;
}
export {};
