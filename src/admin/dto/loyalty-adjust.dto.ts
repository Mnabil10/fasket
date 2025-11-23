import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength, NotEquals } from 'class-validator';

export class AdjustPointsDto {
  @ApiProperty({ description: 'Positive to add points, negative to deduct' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @NotEquals(0)
  points!: number;

  @ApiProperty({ description: 'Reason for audit trail' })
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional related order id' })
  @IsOptional()
  @IsString()
  orderId?: string;
}
