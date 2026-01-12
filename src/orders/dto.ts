import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export enum PaymentMethodDto {
  COD = 'COD',
  CARD = 'CARD',
  WALLET = 'WALLET',
}

export enum OrderSplitFailurePolicyDto {
  CANCEL_GROUP = 'CANCEL_GROUP',
  PARTIAL = 'PARTIAL',
}

export class CreateOrderDto {
  @ApiProperty() @IsString() addressId!: string;
  @ApiProperty({ enum: PaymentMethodDto, default: PaymentMethodDto.COD })
  @IsEnum(PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;
  @ApiPropertyOptional({ description: 'Saved payment method id for card or wallet payments' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() couponCode?: string;
  @ApiProperty({ required: false, description: 'Number of loyalty points to redeem for this order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;

  @ApiProperty({
    required: false,
    description: 'Idempotency key to prevent duplicate order submission',
    minLength: 8,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  idempotencyKey?: string;

  @ApiProperty({ required: false, enum: OrderSplitFailurePolicyDto, default: OrderSplitFailurePolicyDto.PARTIAL })
  @IsOptional()
  @IsEnum(OrderSplitFailurePolicyDto)
  splitFailurePolicy?: OrderSplitFailurePolicyDto = OrderSplitFailurePolicyDto.PARTIAL;

  @ApiPropertyOptional({ description: 'Whether the customer accepted the delivery terms' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  deliveryTermsAccepted?: boolean;
}
