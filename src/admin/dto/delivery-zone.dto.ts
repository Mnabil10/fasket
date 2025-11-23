import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

export class CreateDeliveryZoneDto {
  @ApiProperty()
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ description: 'Delivery fee in cents', minimum: 0 })
  @IsInt()
  @Min(0)
  feeCents!: number;

  @ApiPropertyOptional({ description: 'ETA in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinutes?: number;

  @ApiPropertyOptional({ description: 'Free delivery threshold in cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeDeliveryThresholdCents?: number | null;

  @ApiPropertyOptional({ description: 'Minimum order allowed in cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderAmountCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliveryZoneDto extends PartialType(CreateDeliveryZoneDto) {}

export class ListDeliveryZonesQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: Boolean })
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
  isActive?: boolean;
}
