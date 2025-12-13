import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { OtpService } from '../otp/otp.service';
import { PasswordResetService } from '../password-reset/password-reset.service';

@ApiTags('AuthCompat')
@Controller({ path: 'auth', version: ['1', '2'] })
export class AuthCompatController {
  constructor(private readonly otp: OtpService, private readonly passwordReset: PasswordResetService) {}

  @Post('otp/send')
  async sendOtp(@Body() body: { phone: string }, @Req() req: Request, @Res() res: Response) {
    const result = await this.otp.requestOtp(body.phone, 'LOGIN', req.ip);
    res.setHeader('x-deprecated-endpoint', 'true');
    return res.json(result);
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone: string; otp: string }, @Req() req: Request, @Res() res: Response) {
    const result = await this.otp.verifyOtpLegacy(body.phone, 'LOGIN', body.otp, req.ip);
    res.setHeader('x-deprecated-endpoint', 'true');
    return res.json(result);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { identifier: string }, @Req() req: Request, @Res() res: Response) {
    const result = await this.passwordReset.requestReset(body.identifier, req.ip);
    res.setHeader('x-deprecated-endpoint', 'true');
    return res.json(result);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() body: { identifier: string; otp: string; newPassword: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const otpResult = await this.otp.verifyOtpLegacy(body.identifier, 'PASSWORD_RESET', body.otp, req.ip);
    const resetToken = (otpResult as any)?.resetToken ?? (otpResult as any)?.reset_token;
    if (!resetToken) {
      res.setHeader('x-deprecated-endpoint', 'true');
      return res.status(400).json({ success: false, message: 'Reset token missing' });
    }
    const result = await this.passwordReset.confirmReset(resetToken, body.newPassword);
    res.setHeader('x-deprecated-endpoint', 'true');
    return res.json(result);
  }
}
