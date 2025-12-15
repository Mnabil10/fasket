import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, Matches } from 'class-validator';
import { cleanNullableString, cleanString } from '../common/utils/sanitize.util';

const passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;

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
  @Matches(passwordPolicy, { message: 'Password must be at least 8 chars and contain letters and numbers' })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ description: 'Phone number or email address', example: '+201234567890 or user@fasket.com' })
  @Transform(({ value, obj }) =>
    cleanString(
      String(
        value ??
          obj.identifier ??
          obj.phoneOrEmail ??
          obj.phone ??
          obj.email ??
          obj.username ??
          obj.login ??
          '',
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
  @Matches(passwordPolicy, { message: 'Invalid password format' })
  password!: string;

  @ApiProperty({ required: false, description: '6-digit TOTP code when 2FA is enabled' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  otp?: string;
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
  @Matches(passwordPolicy, { message: 'Password must be at least 8 chars and contain letters and numbers' })
  password?: string;
}

export class VerifyTwoFaDto {
  @ApiProperty({ description: '6-digit TOTP' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  otp!: string;
}

export class SignupStartDto extends RegisterDto {}

export class SignupVerifyDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  otpId!: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'Invalid OTP format' })
  otp!: string;
}

// --- New signup session (Telegram-first) DTOs ---
export class SignupSessionStartDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsPhoneNumber('EG')
  phone!: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  country!: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  fullName!: string;
}

export class SignupSessionTokenDto {
  @ApiProperty()
  @Transform(({ value, obj }) => cleanString(value ?? obj.signupSessionId ?? obj.signupSessionToken))
  @IsString()
  signupSessionToken!: string;

  @ApiProperty({ required: false, description: 'Legacy compatibility' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  signupSessionId?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  lang?: string;
}

export class SignupLinkTokenDto extends SignupSessionTokenDto {}

export class SignupVerifySessionDto extends SignupSessionTokenDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'Invalid OTP format' })
  otp!: string;
}
