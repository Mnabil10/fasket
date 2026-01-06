import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { DeliveryMode, ProviderApplicationStatus, ProviderType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto } from './pagination.dto';

class ProviderApplicationListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ProviderApplicationStatus })
  @IsOptional()
  @IsEnum(ProviderApplicationStatus)
  status?: ProviderApplicationStatus;

  @ApiPropertyOptional({ enum: ProviderType })
  @IsOptional()
  @IsEnum(ProviderType)
  type?: ProviderType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;
}

export class ProviderApplicationListRequestDto extends IntersectionType(PaginationDto, ProviderApplicationListQueryDto) {}

export class ProviderApplicationBranchDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deliveryRadiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryRatePerKmCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minDeliveryFeeCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDeliveryFeeCents?: number;

  @ApiPropertyOptional({ enum: DeliveryMode })
  @IsOptional()
  @IsEnum(DeliveryMode)
  deliveryMode?: DeliveryMode;
}

export class ApproveProviderApplicationDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ description: 'Override commission rate (basis points)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionRateBpsOverride?: number;

  @ApiPropertyOptional({ type: ProviderApplicationBranchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderApplicationBranchDto)
  branch?: ProviderApplicationBranchDto;
}

export class RejectProviderApplicationDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  reason?: string;
}
