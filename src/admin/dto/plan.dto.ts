import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class CreatePlanDto {
  @ApiProperty()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  code!: string;

  @ApiProperty()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : String(value).trim()))
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: BillingInterval })
  @IsEnum(BillingInterval)
  billingInterval!: BillingInterval;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : String(value).trim()))
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Commission in basis points (100 = 1%)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionRateBps?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Boolean(value)))
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}

class PlanListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: BillingInterval })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PlanListRequestDto extends IntersectionType(PaginationDto, PlanListQueryDto) {}
