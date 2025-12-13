import { Request, Response } from 'express';
import { OtpService } from '../otp/otp.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
export declare class AuthCompatController {
    private readonly otp;
    private readonly passwordReset;
    constructor(otp: OtpService, passwordReset: PasswordResetService);
    sendOtp(body: {
        phone: string;
    }, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    verifyOtp(body: {
        phone: string;
        otp: string;
    }, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    forgotPassword(body: {
        identifier: string;
    }, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    resetPassword(body: {
        identifier: string;
        otp: string;
        newPassword: string;
    }, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
