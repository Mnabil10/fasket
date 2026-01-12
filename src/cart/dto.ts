import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { cleanString } from '../common/utils/sanitize.util';

export class CartItemOptionDto {
  @ApiProperty()
  @IsString()
  optionId!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class AddToCartDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() branchId?: string;
  @ApiProperty() @IsInt() @Min(1) qty!: number;
  @ApiPropertyOptional({ type: [CartItemOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemOptionDto)
  options?: CartItemOptionDto[];
}
export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) qty!: number;
  @ApiPropertyOptional({ type: [CartItemOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemOptionDto)
  options?: CartItemOptionDto[];
}

export class ApplyCouponDto {
  @ApiProperty({ description: 'Coupon code to validate and apply', example: 'SAVE10' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  couponCode!: string;
}
