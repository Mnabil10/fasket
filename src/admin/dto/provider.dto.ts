import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto } from './pagination.dto';

export enum ProviderTypeDto {
  SUPERMARKET = 'SUPERMARKET',
  PHARMACY = 'PHARMACY',
  RESTAURANT = 'RESTAURANT',
  SERVICE = 'SERVICE',
  OTHER = 'OTHER',
}

export enum ProviderStatusDto {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum DeliveryModeDto {
  PLATFORM = 'PLATFORM',
  MERCHANT = 'MERCHANT',
}

export class CreateProviderDto {
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

  @ApiPropertyOptional({ enum: ProviderTypeDto, default: ProviderTypeDto.SUPERMARKET })
  @IsOptional()
  @IsEnum(ProviderTypeDto)
  type?: ProviderTypeDto = ProviderTypeDto.SUPERMARKET;

  @ApiPropertyOptional({ enum: ProviderStatusDto, default: ProviderStatusDto.PENDING })
  @IsOptional()
  @IsEnum(ProviderStatusDto)
  status?: ProviderStatusDto = ProviderStatusDto.PENDING;

  @ApiPropertyOptional({ enum: DeliveryModeDto, default: DeliveryModeDto.PLATFORM })
  @IsOptional()
  @IsEnum(DeliveryModeDto)
  deliveryMode?: DeliveryModeDto = DeliveryModeDto.PLATFORM;

  @ApiPropertyOptional({ description: 'Delivery fee per km in cents' })
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

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  descriptionAr?: string;
}

export class UpdateProviderDto extends PartialType(CreateProviderDto) {}

export class ProviderListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ProviderTypeDto })
  @IsOptional()
  @IsEnum(ProviderTypeDto)
  type?: ProviderTypeDto;

  @ApiPropertyOptional({ enum: ProviderStatusDto })
  @IsOptional()
  @IsEnum(ProviderStatusDto)
  status?: ProviderStatusDto;
}

export class ProviderListRequestDto extends IntersectionType(PaginationDto, ProviderListQueryDto) {}
