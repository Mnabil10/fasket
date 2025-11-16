import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
