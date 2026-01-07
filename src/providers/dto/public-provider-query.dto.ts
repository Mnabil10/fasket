import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { normalizeLang } from '../../common/utils/localize.util';

export class PublicProviderListDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  @Transform(({ value }) => normalizeLang(value))
  lang?: 'en' | 'ar';

  @ApiPropertyOptional({ description: 'Search by provider name or slug' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['SUPERMARKET', 'PHARMACY', 'RESTAURANT', 'SERVICE', 'OTHER'] })
  @IsOptional()
  @IsIn(['SUPERMARKET', 'PHARMACY', 'RESTAURANT', 'SERVICE', 'OTHER'])
  type?: 'SUPERMARKET' | 'PHARMACY' | 'RESTAURANT' | 'SERVICE' | 'OTHER';
}
