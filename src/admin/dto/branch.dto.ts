import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto } from './pagination.dto';
import { DeliveryModeDto } from './provider.dto';

export enum BranchStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class CreateBranchDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  providerId!: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ enum: BranchStatusDto, default: BranchStatusDto.ACTIVE })
  @IsOptional()
  @IsEnum(BranchStatusDto)
  status?: BranchStatusDto = BranchStatusDto.ACTIVE;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  address?: string;

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
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ enum: DeliveryModeDto })
  @IsOptional()
  @IsEnum(DeliveryModeDto)
  deliveryMode?: DeliveryModeDto;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Delivery fee per km in cents' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryRatePerKmCents?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  minDeliveryFeeCents?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDeliveryFeeCents?: number;

  @ApiPropertyOptional({ description: 'GeoJSON or polygon payload' })
  @IsOptional()
  @IsObject()
  serviceArea?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
  })
  schedulingEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
  })
  schedulingAllowAsap?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class BranchListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: BranchStatusDto })
  @IsOptional()
  @IsEnum(BranchStatusDto)
  status?: BranchStatusDto;
}

export class BranchListRequestDto extends IntersectionType(PaginationDto, BranchListQueryDto) {}
