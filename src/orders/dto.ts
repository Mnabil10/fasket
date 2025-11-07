import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethodDto { COD='COD', CARD='CARD' }

export class CreateOrderDto {
  @ApiProperty() @IsString() addressId!: string;
  @ApiProperty({ enum: PaymentMethodDto, default: PaymentMethodDto.COD }) @IsEnum(PaymentMethodDto) paymentMethod!: PaymentMethodDto;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() couponCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cartId?: string;
  @ApiProperty({ required: false, type: () => [OrderItemInputDto] })
  @ValidateIf(o => !o.cartId)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];
}

export class OrderItemInputDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsInt() @Min(1) qty!: number;
}
