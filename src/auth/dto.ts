import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsPhoneNumber('EG') phone!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;
}

export class LoginDto {
  @ApiProperty() @IsPhoneNumber('EG') phone!: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken!: string;
}

export class UpdateProfileDto {
  @ApiProperty() @IsOptional() @IsString() name?: string;
  @ApiProperty() @IsOptional() @IsString() @MinLength(6) password?: string;
}
