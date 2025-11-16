import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { cleanNullableString, cleanString } from '../common/utils/sanitize.util';

export class RegisterDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsPhoneNumber('EG')
  phone!: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value)?.toLowerCase())
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @MinLength(6)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ description: 'Phone number or email address', example: '+201234567890 or user@fasket.com' })
  @Transform(({ value, obj }) =>
    cleanString(
      String(
        value ?? obj.identifier ?? obj.phone ?? obj.email ?? obj.username ?? obj.login ?? '',
      ),
    ),
  )
  @IsString()
  identifier!: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value)?.toLowerCase())
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  login?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class UpdateProfileDto {
  @ApiProperty()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
