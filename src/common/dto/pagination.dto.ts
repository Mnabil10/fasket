import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => Number(value ?? 1))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.limit ?? obj?.take;
    const raw = source ?? 20;
    return Math.min(100, Number(raw));
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    name: 'limit',
    description: 'Alias for pageSize',
    minimum: 1,
    maximum: 100,
  })
  @Transform(({ value }) => (value === undefined ? undefined : Math.min(100, Number(value))))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    name: 'take',
    description: 'Alias for pageSize',
    minimum: 1,
    maximum: 100,
  })
  @Transform(({ value }) => (value === undefined ? undefined : Math.min(100, Number(value))))
  @IsOptional()
  @IsInt()
  @Min(1)
  takeParam?: number;

  get skip() {
    return ((this.page ?? 1) - 1) * (this.pageSize ?? 20);
  }
  get take() {
    return this.pageSize ?? 20;
  }
}

export class SortDto {
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc' = 'desc';
}
