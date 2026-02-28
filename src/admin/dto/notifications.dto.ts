import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NotificationStatus, UserRole } from '@prisma/client';
import { PaginationDto } from './pagination.dto';

export class NotificationTargetDto {
  @ApiProperty({
    enum: [
      'all',
      'role',
      'area',
      'areas',
      'provider',
      'user',
      'customers_with_coupons',
      'coupon_users',
      'provider_customers',
      'recent_customers',
      'minimum_orders',
      'minimum_orders_recent',
      'delivery_campaign_customers',
    ],
  })
  @IsIn([
    'all',
    'role',
    'area',
    'areas',
    'provider',
    'user',
    'customers_with_coupons',
    'coupon_users',
    'provider_customers',
    'recent_customers',
    'minimum_orders',
    'minimum_orders_recent',
    'delivery_campaign_customers',
  ])
  type!:
    | 'all'
    | 'role'
    | 'area'
    | 'areas'
    | 'provider'
    | 'user'
    | 'customers_with_coupons'
    | 'coupon_users'
    | 'provider_customers'
    | 'recent_customers'
    | 'minimum_orders'
    | 'minimum_orders_recent'
    | 'delivery_campaign_customers';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryCampaignId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  minOrders?: number;
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
