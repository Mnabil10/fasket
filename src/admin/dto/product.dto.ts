import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto } from './pagination.dto';

export enum ProductStatusDto { DRAFT='DRAFT', ACTIVE='ACTIVE', HIDDEN='HIDDEN', DISCONTINUED='DISCONTINUED' }

export class CreateProductDto {
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

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salePriceCents?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHotOffer?: boolean;

  @ApiPropertyOptional({ enum: ProductStatusDto, default: ProductStatusDto.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatusDto)
  status?: ProductStatusDto = ProductStatusDto.ACTIVE;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ enum: ProductStatusDto })
  @IsOptional() @IsEnum(ProductStatusDto) status?: ProductStatusDto;

  @ApiPropertyOptional({ description: 'Min price in cents' })
  @Transform(({ value }) => value === undefined ? undefined : Number(value))
  @IsOptional() @IsInt() @Min(0) minPriceCents?: number;

  @ApiPropertyOptional({ description: 'Max price in cents' })
  @Transform(({ value }) => value === undefined ? undefined : Number(value))
  @IsOptional() @IsInt() @Min(0) maxPriceCents?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => value === 'true')
  @IsOptional() @IsBoolean() inStock?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt','priceCents','name'], default: 'createdAt' })
  @IsOptional() @IsString() orderBy?: 'createdAt' | 'priceCents' | 'name' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc','desc'], default: 'desc' })
  @IsOptional() @IsString() sort?: 'asc' | 'desc' = 'desc';
}

export class ProductListRequestDto extends IntersectionType(PaginationDto, ProductListQueryDto) {}
