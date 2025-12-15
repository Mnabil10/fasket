import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OtpService } from './otp.service';

@ApiTags('Auth')
@Controller({ path: 'auth', version: ['1', '2'] })
export class OtpPublicController {
  constructor(private readonly otp: OtpService) {}

  @Post('request-otp')
  async requestOtp(@Body() body: { phone: string }, @Req() req: Request) {
    return this.otp.requestOtp(body.phone, 'LOGIN', req.ip);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: { phone: string; otp: string }, @Req() req: Request) {
    return this.otp.verifyOtpLegacy(body.phone, 'LOGIN', body.otp, req.ip);
  }
}
