import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaymentMethod, WalletProvider } from '@prisma/client';
import { cleanNullableString, cleanString } from '../common/utils/sanitize.util';
import { normalizePhoneToE164OrNull } from '../common/utils/phone.util';

export class CreatePaymentMethodDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  type!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Provider identifier (stripe, paymob, vodafone_cash, etc.)' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ description: 'Token or vault reference from the payment provider' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  token!: string;

  @ApiPropertyOptional({ description: 'Last 4 digits for cards' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  @Length(4, 4)
  last4?: string;

  @ApiPropertyOptional({ description: 'Card brand (Visa, MasterCard, etc.)' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Card expiry month (1-12)' })
  @Transform(({ value }) => (value === undefined || value === null ? value : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @ApiPropertyOptional({ description: 'Card expiry year (YYYY)' })
  @Transform(({ value }) => (value === undefined || value === null ? value : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  expYear?: number;

  @ApiPropertyOptional({ enum: WalletProvider })
  @IsOptional()
  @IsEnum(WalletProvider)
  walletProvider?: WalletProvider;

  @ApiPropertyOptional({ description: 'Wallet phone number in E.164 format' })
  @Transform(({ value }) => normalizePhoneToE164OrNull(cleanNullableString(value)))
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  walletPhone?: string;

  @ApiPropertyOptional({ description: 'Set as default payment method' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isDefault?: boolean;
}
