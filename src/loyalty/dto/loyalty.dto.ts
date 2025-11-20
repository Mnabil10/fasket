import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class LoyaltyHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Number of recent transactions to return', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdjustLoyaltyPointsDto {
  @ApiProperty({ description: 'Positive to grant points, negative to deduct' })
  @IsInt()
  points!: number;

  @ApiProperty({ description: 'Reason shown in the audit trail' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
