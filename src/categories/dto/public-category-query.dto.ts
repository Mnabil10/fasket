import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { normalizeLang } from '../../common/utils/localize.util';

export class PublicCategoryListDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  @Transform(({ value }) => {
    return normalizeLang(value);
  })
  lang?: 'en' | 'ar';

  @ApiPropertyOptional({ description: 'Search by category name or slug' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc' = 'asc';
}
