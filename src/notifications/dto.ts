import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'BCP-47 language code', example: 'en' })
  @Transform(({ value }) => {
    const cleaned = cleanString(value);
    return typeof cleaned === 'string' ? cleaned.toLowerCase() : undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ description: 'App version string' })
  @Transform(({ value }) => {
    const cleaned = cleanString(value);
    return typeof cleaned === 'string' ? cleaned : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Device model identifier' })
  @Transform(({ value }) => {
    const cleaned = cleanString(value);
    return typeof cleaned === 'string' ? cleaned : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceModel?: string;
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'Push token to remove' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @MinLength(10)
  token!: string;
}
