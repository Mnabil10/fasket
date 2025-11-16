import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { cleanString } from '../common/utils/sanitize.util';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Push token from FCM/OneSignal/APNS' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @MinLength(10)
  token!: string;

  @ApiPropertyOptional({ enum: ['ios','android','web','unknown'], default: 'unknown' })
  @Transform(({ value }) => (value ? String(value).toLowerCase().trim() : 'unknown'))
  @IsOptional()
  @IsIn(['ios','android','web','unknown'])
  platform?: 'ios' | 'android' | 'web' | 'unknown' = 'unknown';
}
