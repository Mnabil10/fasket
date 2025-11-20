import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum PaymentMethodDto {
  COD = 'COD',
  CARD = 'CARD',
}

export class CreateOrderDto {
  @ApiProperty() @IsString() addressId!: string;
  @ApiProperty({ enum: PaymentMethodDto, default: PaymentMethodDto.COD })
  @IsEnum(PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() couponCode?: string;
  @ApiProperty({ required: false, description: 'Number of loyalty points to redeem for this order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;
}
