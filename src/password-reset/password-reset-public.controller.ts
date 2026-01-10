import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import { OtpService } from '../otp/otp.service';
import { PasswordResetService } from './password-reset.service';

class PasswordForgotDto {
  @ApiProperty() @IsString()
  phone!: string;
}

class PasswordConfirmOtpDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty() @IsString()
  otp!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  otpId?: string;
}

class PasswordResetDto {
  @ApiProperty() @IsString()
  resetToken!: string;
  @ApiProperty() @IsString()
  newPassword!: string;
}

@ApiTags('Auth')
@Controller({ path: 'auth/password', version: ['1', '2'] })
export class PasswordResetPublicController {
  constructor(
    private readonly otp: OtpService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('forgot')
  async forgot(@Body() dto: PasswordForgotDto, @Req() req: Request) {
    const result = await this.passwordReset.requestReset(dto.phone, req.ip);
    return { ...result, success: true };
  }

  @Post('confirm-otp')
  async confirmOtp(@Body() dto: PasswordConfirmOtpDto, @Req() req: Request) {
    const result = dto.otpId
      ? await this.otp.verifyOtp(dto.phone, 'PASSWORD_RESET', dto.otpId, dto.otp, req.ip)
      : await this.otp.verifyOtpLegacy(dto.phone, 'PASSWORD_RESET', dto.otp, req.ip);
    return result;
  }

  @Post('reset')
  async reset(@Body() dto: PasswordResetDto) {
    const result = await this.passwordReset.confirmReset(dto.resetToken, dto.newPassword);
    return result;
  }
}
