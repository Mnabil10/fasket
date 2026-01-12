import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto } from './pagination.dto';

const parseNumber = (value: unknown) => (value === undefined ? undefined : Number(value));

const parseDaysOfWeek = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map((entry) => Number(entry));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number(part));
  }
  return value as number[];
};

export class CreateDeliveryWindowDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ description: 'Start minutes since midnight (0-1440)' })
  @Transform(({ value }) => parseNumber(value))
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinutes!: number;

  @ApiProperty({ description: 'End minutes since midnight (0-1440)' })
  @Transform(({ value }) => parseNumber(value))
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinutes!: number;

  @ApiPropertyOptional({ description: 'Days of week (0=Sunday ... 6=Saturday)' })
  @Transform(({ value }) => parseDaysOfWeek(value))
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional()
  @Transform(({ value }) => parseNumber(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  minLeadMinutes?: number;

  @ApiPropertyOptional({ description: 'Minimum order in cents' })
  @Transform(({ value }) => parseNumber(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderAmountCents?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => parseNumber(value))
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliveryWindowDto extends PartialType(CreateDeliveryWindowDto) {}

export class DeliveryWindowListQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

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
