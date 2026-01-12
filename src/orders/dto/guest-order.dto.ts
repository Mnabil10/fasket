import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { normalizePhoneToE164 } from '../../common/utils/phone.util';
import { OrderSplitFailurePolicyDto, PaymentMethodDto } from '../dto';

export class GuestOrderItemOptionDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  optionId!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class GuestOrderItemDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  productId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ type: [GuestOrderItemOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemOptionDto)
  options?: GuestOrderItemOptionDto[];
}

export class GuestAddressDto {
  @ApiProperty({ description: 'Full address text' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @IsNotEmpty()
  fullAddress!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  building?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Delivery zone id (optional)' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : Number(value)))
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : Number(value)))
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class GuestOrderQuoteDto {
  @ApiProperty({ type: [GuestOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemDto)
  items!: GuestOrderItemDto[];

  @ApiProperty({ type: GuestAddressDto })
  @ValidateNested()
  @Type(() => GuestAddressDto)
  address!: GuestAddressDto;

  @ApiPropertyOptional({ enum: OrderSplitFailurePolicyDto, default: OrderSplitFailurePolicyDto.PARTIAL })
  @IsOptional()
  @IsEnum(OrderSplitFailurePolicyDto)
  splitFailurePolicy?: OrderSplitFailurePolicyDto = OrderSplitFailurePolicyDto.PARTIAL;

  @ApiPropertyOptional({ description: 'Selected delivery window id (optional for ASAP)' })
  @IsOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsString()
  deliveryWindowId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp for the selected delivery window start' })
  @IsOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsString()
  scheduledAt?: string;
}

export class CreateGuestOrderDto extends GuestOrderQuoteDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ enum: PaymentMethodDto, default: PaymentMethodDto.COD })
  @IsOptional()
  @IsEnum(PaymentMethodDto)
  paymentMethod?: PaymentMethodDto = PaymentMethodDto.COD;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Idempotency key to prevent duplicate submission' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Whether the guest accepted the delivery terms' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  deliveryTermsAccepted?: boolean;
}

export class GuestOrderTrackOtpRequestDto {
  @ApiProperty()
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class GuestOrderTrackOtpVerifyDto {
  @ApiProperty()
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  otpId?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  otp!: string;

  @ApiPropertyOptional({ description: 'Optional order code to narrow down results' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  code?: string;
}
