import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NotificationStatus, UserRole } from '@prisma/client';
import { PaginationDto } from './pagination.dto';

export class NotificationTargetDto {
  @ApiProperty({ enum: ['all', 'role', 'area', 'areas', 'provider', 'user'] })
  @IsIn(['all', 'role', 'area', 'areas', 'provider', 'user'])
  type!: 'all' | 'role' | 'area' | 'areas' | 'provider' | 'user';

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areaIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class AdminNotificationCreateDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: ['push', 'webpush'] })
  @IsOptional()
  @IsIn(['push', 'webpush'])
  channel?: 'push' | 'webpush';

  @ApiPropertyOptional({ enum: ['high', 'normal'] })
  @IsOptional()
  @IsIn(['high', 'normal'])
  priority?: 'high' | 'normal';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sound?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendNow?: boolean;

  @ApiProperty({ type: NotificationTargetDto })
  @ValidateNested()
  @Type(() => NotificationTargetDto)
  target!: NotificationTargetDto;
}

export class AdminNotificationListDto extends PaginationDto {
  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

export class NotificationLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['sent', 'failed'] })
  @IsOptional()
  @IsIn(['sent', 'failed'])
  status?: 'sent' | 'failed';
}

class WebPushKeysDto {
  @ApiProperty()
  @IsString()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  auth!: string;
}

export class WebPushSubscriptionDto {
  @ApiProperty()
  @IsString()
  endpoint!: string;

  @ApiProperty({ type: WebPushKeysDto })
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys!: WebPushKeysDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}
