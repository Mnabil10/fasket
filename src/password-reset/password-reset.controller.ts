import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { PasswordResetService } from './password-reset.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

class PasswordResetRequestDto {
  @ApiProperty() @IsString()
  phone!: string;
}

class PasswordResetConfirmDto {
  @ApiProperty() @IsString()
  resetToken!: string;
  @ApiProperty() @IsString()
  newPassword!: string;
}

@ApiTags('Auth')
@UseGuards(ThrottlerGuard)
@Controller({ path: 'auth/password-reset', version: ['1', '2'] })
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post('request')
  @Throttle({ passwordResetRequest: {} })
  request(@Body() dto: PasswordResetRequestDto, @Req() req: Request) {
    return this.service.requestReset(dto.phone, req.ip);
  }

  @Post('confirm')
  @Throttle({ passwordResetConfirm: {} })
  confirm(@Body() dto: PasswordResetConfirmDto) {
    return this.service.confirmReset(dto.resetToken, dto.newPassword);
  }
}
