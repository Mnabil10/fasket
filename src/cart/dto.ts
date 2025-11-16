import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, MinLength } from 'class-validator';
import { cleanString } from '../common/utils/sanitize.util';

export class AddToCartDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsInt() @Min(1) qty!: number;
}
export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) qty!: number;
}

export class ApplyCouponDto {
  @ApiProperty({ description: 'Coupon code to validate and apply', example: 'SAVE10' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  couponCode!: string;
}
