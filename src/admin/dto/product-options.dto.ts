import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductOptionGroupPriceMode, ProductOptionGroupType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';

export class CreateProductOptionGroupDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ enum: ProductOptionGroupType })
  @IsEnum(ProductOptionGroupType)
  type!: ProductOptionGroupType;

  @ApiPropertyOptional({ enum: ProductOptionGroupPriceMode })
  @IsOptional()
  @IsEnum(ProductOptionGroupPriceMode)
  priceMode?: ProductOptionGroupPriceMode;

  @ApiPropertyOptional({ description: 'Minimum selections required' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelected?: number;

  @ApiPropertyOptional({ description: 'Maximum selections allowed' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelected?: number | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductOptionGroupDto extends PartialType(CreateProductOptionGroupDto) {}

export class AttachProductOptionGroupDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  groupId!: string;
}

export class CreateProductOptionDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'Price in cents' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Max quantity per option' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  maxQtyPerOption?: number | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductOptionDto extends PartialType(CreateProductOptionDto) {}
