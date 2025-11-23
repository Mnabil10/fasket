import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, IsObject } from 'class-validator';
import { cleanString } from '../common/utils/sanitize.util';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Push token from FCM/OneSignal/APNS' })
  @Transform(({ value, obj }) => {
    const source =
      value ??
      (obj as any)?.token ??
      (obj as any)?.deviceToken ??
      (obj as any)?.fcmToken ??
      (obj as any)?.pushToken;
    return cleanString(source);
  })
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

  @ApiPropertyOptional({ description: 'Client-side preferences payload (optional)' })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;

  // Accepted for compatibility with some clients; ignored by service
  @ApiPropertyOptional({ description: 'Optional userId (ignored; derived from auth)' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'Push token to remove' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @MinLength(10)
  token!: string;
}
