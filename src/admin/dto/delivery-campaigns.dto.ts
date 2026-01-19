import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class DeliveryCampaignListDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activeNow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class DeliveryCampaignCreateDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  zones!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  providers!: string[];

  @ApiPropertyOptional({ description: 'Delivery price in store currency' })
  @IsOptional()
  deliveryPrice?: number;

  @ApiPropertyOptional({ description: 'Delivery price in cents', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryPriceCents?: number;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxOrders?: number;

  @ApiPropertyOptional({ description: 'Max discount in store currency' })
  @IsOptional()
  maxDiscount?: number;

  @ApiPropertyOptional({ description: 'Max discount in cents', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountCents?: number;
}

export class DeliveryCampaignUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zones?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providers?: string[];

  @ApiPropertyOptional({ description: 'Delivery price in store currency' })
  @IsOptional()
  deliveryPrice?: number;

  @ApiPropertyOptional({ description: 'Delivery price in cents', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryPriceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxOrders?: number | null;

  @ApiPropertyOptional({ description: 'Max discount in store currency' })
  @IsOptional()
  maxDiscount?: number | null;

  @ApiPropertyOptional({ description: 'Max discount in cents', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountCents?: number | null;
}

export class DeliveryCampaignNotifyDto {
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

  @ApiPropertyOptional({ type: [String], description: 'Optional override for zones' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zoneIds?: string[];
}
