import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, ArrayNotEmpty, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { PaginationDto, SortDto } from './pagination.dto';

export class CreateCategoryDto {
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
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

/** Allow searching by name with ?q=... in admin categories list */
export class CategoryQueryDto extends PartialType(UpdateCategoryDto) {
  @ApiPropertyOptional({ description: 'search by name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'filter by provider id' })
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class CategoryListQueryDto extends IntersectionType(
  PaginationDto,
  IntersectionType(SortDto, CategoryQueryDto),
) {}

export class CategoryProductReorderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedProductIds!: string[];
}
