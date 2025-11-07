import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => Number(value))
  @IsOptional() @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) => Math.min(100, Number(value)))
  @IsOptional() @IsInt() @Min(1)
  pageSize?: number = 20;

  get skip() { return ((this.page ?? 1) - 1) * (this.pageSize ?? 20); }
  get take() { return this.pageSize ?? 20; }
}

export class SortDto {
  @ApiPropertyOptional({ enum: ['asc','desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc','desc'])
  sort?: 'asc' | 'desc' = 'desc';
}
