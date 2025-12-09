import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { normalizeLang } from '../../common/utils/localize.util';

export class PublicProductListDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ description: 'Minimum price (EGP)', type: 'number' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum price (EGP)', type: 'number' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  @Transform(({ value }) => {
    return normalizeLang(value);
  })
  lang?: 'en' | 'ar';

  @ApiPropertyOptional({ enum: ['createdAt', 'priceCents', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'priceCents', 'name'])
  orderBy?: 'createdAt' | 'priceCents' | 'name' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc' = 'desc';
}

export class PublicProductFeedDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  @Transform(({ value }) => {
    return normalizeLang(value);
  })
  lang?: 'en' | 'ar';

  @ApiPropertyOptional({ description: 'ISO date start bound for best-selling analytics', type: String })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date end bound for best-selling analytics', type: String })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: ['qty'], description: 'Sort field for feed', default: 'qty' })
  @IsOptional()
  @IsIn(['qty'])
  orderBy?: 'qty' = 'qty';

  @ApiPropertyOptional({ enum: ['desc', 'asc'], default: 'desc' })
  @IsOptional()
  @IsIn(['desc', 'asc'])
  sort?: 'desc' | 'asc' = 'desc';
}
