import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { OtpService, OtpPurpose } from './otp.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

class OtpRequestDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty({ enum: ['LOGIN', 'PASSWORD_RESET', 'SIGNUP'] }) @IsIn(['LOGIN', 'PASSWORD_RESET', 'SIGNUP'])
  purpose!: OtpPurpose;
}

class OtpVerifyDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty({ enum: ['LOGIN', 'PASSWORD_RESET', 'SIGNUP'] }) @IsIn(['LOGIN', 'PASSWORD_RESET', 'SIGNUP'])
  purpose!: OtpPurpose;
  @ApiProperty() @IsString()
  otpId!: string;
  @ApiProperty() @IsString()
  otp!: string;
}

@ApiTags('Auth')
@UseGuards(ThrottlerGuard)
@Controller({ path: 'auth/otp', version: ['1', '2'] })
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('request')
  @Throttle({ otpRequest: {} })
  request(@Body() dto: OtpRequestDto, @Req() req: Request) {
    return this.otp.requestOtp(dto.phone, dto.purpose, req.ip);
  }

  @Post('verify')
  @Throttle({ otpVerify: {} })
  verify(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    return this.otp.verifyOtp(dto.phone, dto.purpose, dto.otpId, dto.otp, req.ip);
  }
}
