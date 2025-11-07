import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty() @IsString() label!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiProperty() @IsOptional() @IsString() zone?: string;
  @ApiProperty() @IsString() street!: string;
  @ApiProperty() @IsOptional() @IsString() building?: string;
  @ApiProperty() @IsOptional() @IsString() apartment?: string;
  @ApiProperty() @IsOptional() @IsNumber() lat?: number;
  @ApiProperty() @IsOptional() @IsNumber() lng?: number;
}
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
