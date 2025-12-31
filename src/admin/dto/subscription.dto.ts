import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class CreateSubscriptionDto {
  @ApiProperty()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  providerId!: string;

  @ApiProperty()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  cancelAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  canceledAt?: string;
}

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {}

class SubscriptionListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class SubscriptionListRequestDto extends IntersectionType(PaginationDto, SubscriptionListQueryDto) {}
