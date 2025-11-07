import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RangeDto {
  @ApiPropertyOptional({ description: 'ISO date inclusive' })
  @IsOptional() @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date inclusive' })
  @IsOptional() @IsString()
  to?: string;
}

export class TimeSeriesDto extends RangeDto {
  @ApiPropertyOptional({ enum: ['day','week','month'], default: 'day' })
  @IsOptional() @IsIn(['day','week','month'])
  granularity?: 'day' | 'week' | 'month' = 'day';
}

export class LimitDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional() @IsInt() @Min(1)
  limit?: number = 10;
}

export class ThresholdDto {
  @ApiPropertyOptional({ default: 10, minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  threshold?: number = 10;
}
