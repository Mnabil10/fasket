import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  CommissionDiscountRule,
  CommissionMode,
  CommissionScope,
  FeeRecipient,
  LedgerEntryType,
  PayoutStatus,
} from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

class DateRangeDto {
  @ApiPropertyOptional({ description: 'ISO date' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class FinanceBalanceListDto extends IntersectionType(PaginationDto, DateRangeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Minimum available balance (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  minAvailableCents?: number;
}

export class FinanceLedgerListDto extends IntersectionType(PaginationDto, DateRangeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: LedgerEntryType })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;
}

export class FinancePayoutListDto extends IntersectionType(PaginationDto, DateRangeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}

export class FinanceStatementQueryDto extends DateRangeDto {
  @ApiPropertyOptional({ enum: ['json', 'csv'] })
  @IsOptional()
  @IsString()
  format?: 'json' | 'csv';
}

export class CreatePayoutDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty({ description: 'Amount to pay vendor (cents)' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiPropertyOptional({ description: 'Fee charged to vendor (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  feeCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class UpdatePayoutDto {
  @ApiProperty({ enum: PayoutStatus })
  @IsEnum(PayoutStatus)
  status!: PayoutStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failureReason?: string;
}

export class CommissionConfigListDto extends IntersectionType(PaginationDto, DateRangeDto) {
  @ApiPropertyOptional({ enum: CommissionScope })
  @IsOptional()
  @IsEnum(CommissionScope)
  scope?: CommissionScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class CreateCommissionConfigDto {
  @ApiProperty({ enum: CommissionScope })
  @IsEnum(CommissionScope)
  scope!: CommissionScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: CommissionMode })
  @IsOptional()
  @IsEnum(CommissionMode)
  mode?: CommissionMode;

  @ApiPropertyOptional({ description: 'Commission rate in basis points' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionRateBps?: number;

  @ApiPropertyOptional({ description: 'Minimum commission per order (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  minCommissionCents?: number;

  @ApiPropertyOptional({ description: 'Maximum commission per order (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCommissionCents?: number;

  @ApiPropertyOptional({ enum: FeeRecipient })
  @IsOptional()
  @IsEnum(FeeRecipient)
  deliveryFeeRecipient?: FeeRecipient;

  @ApiPropertyOptional({ enum: FeeRecipient })
  @IsOptional()
  @IsEnum(FeeRecipient)
  gatewayFeeRecipient?: FeeRecipient;

  @ApiPropertyOptional({ enum: CommissionDiscountRule })
  @IsOptional()
  @IsEnum(CommissionDiscountRule)
  discountRule?: CommissionDiscountRule;

  @ApiPropertyOptional({ description: 'Gateway fee rate in basis points' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  gatewayFeeRateBps?: number;

  @ApiPropertyOptional({ description: 'Gateway flat fee (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  gatewayFeeFlatCents?: number;

  @ApiPropertyOptional({ description: 'Hold days before payout availability' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  payoutHoldDays?: number;

  @ApiPropertyOptional({ description: 'Minimum payout (cents)' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumPayoutCents?: number;
}

export class UpdateCommissionConfigDto extends PartialType(CreateCommissionConfigDto) {}
