import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateLoyaltySettingsDto {
  @ApiPropertyOptional({ description: 'Enable/disable loyalty program' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || String(value).toLowerCase() === 'true'))
  @IsBoolean()
  loyaltyEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Points earned per 1 currency unit', minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  earnRate?: number;

  @ApiPropertyOptional({ description: 'Currency value per point', minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  redeemRateValue?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  minRedeemPoints?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  maxRedeemPerOrder?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;

  @ApiPropertyOptional({ description: 'Cycle reset threshold', minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  resetThreshold?: number;
}
