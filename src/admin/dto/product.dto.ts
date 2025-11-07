import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export enum ProductStatusDto { DRAFT='DRAFT', ACTIVE='ACTIVE', HIDDEN='HIDDEN', DISCONTINUED='DISCONTINUED' }

export class CreateProductDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameAr?: string;
  @ApiProperty() @IsString() slug!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;

  @ApiProperty() @IsInt() @Min(0) priceCents!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) salePriceCents?: number;

  @ApiProperty() @IsInt() @Min(0) stock!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHotOffer?: boolean;

  @ApiPropertyOptional({ enum: ProductStatusDto, default: ProductStatusDto.ACTIVE })
  @IsOptional() @IsEnum(ProductStatusDto) status?: ProductStatusDto = ProductStatusDto.ACTIVE;

  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray()
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
