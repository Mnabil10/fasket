import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { OtpService, OtpPurpose } from './otp.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

class OtpRequestDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty({ enum: ['LOGIN', 'PASSWORD_RESET', 'SIGNUP'], required: false })
  @IsOptional()
  @IsIn(['LOGIN', 'PASSWORD_RESET', 'SIGNUP'])
  purpose?: OtpPurpose;
}

class OtpVerifyDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty({ enum: ['LOGIN', 'PASSWORD_RESET', 'SIGNUP'], required: false })
  @IsOptional()
  @IsIn(['LOGIN', 'PASSWORD_RESET', 'SIGNUP'])
  purpose?: OtpPurpose;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  otpId?: string;
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
    return this.otp.requestOtp(dto.phone, dto.purpose ?? 'LOGIN', req.ip);
  }

  @Post('verify')
  @Throttle({ otpVerify: {} })
  verify(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    const purpose = dto.purpose ?? 'LOGIN';
    if (dto.otpId) {
      return this.otp.verifyOtp(dto.phone, purpose, dto.otpId, dto.otp, req.ip);
    }
    return this.otp.verifyOtpLegacy(dto.phone, purpose, dto.otp, req.ip);
  }
}
