import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ProviderType } from '@prisma/client';
import { cleanNullableString, cleanString } from '../common/utils/sanitize.util';
import { normalizePhoneToE164 } from '../common/utils/phone.util';

const passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;

export class RegisterDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  name!: string;

  @ApiProperty()
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @Matches(/^\+[1-9]\d{7,14}$/)
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

export class ProviderRegisterDto extends RegisterDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  providerName!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  providerNameAr?: string;

  @ApiPropertyOptional({ enum: ProviderType, default: ProviderType.SUPERMARKET })
  @IsOptional()
  @IsEnum(ProviderType)
  providerType?: ProviderType;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchCity?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  branchRegion?: string;
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

export class LoginOtpDto {
  @ApiProperty({ description: 'Phone number for OTP login', example: '+201234567890' })
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ description: 'OTP code', example: '123456' })
  @Transform(({ value }) => cleanString(value))
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'Invalid OTP format' })
  otp!: string;
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
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @Matches(/^\+[1-9]\d{7,14}$/)
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
  @ApiProperty({ required: false })
  @Transform(({ value, obj }) => cleanString(value ?? obj.signupSessionToken ?? obj.signupSessionId))
  @IsOptional()
  @IsString()
  signupSessionToken?: string;

  @ApiProperty({ required: false, description: 'Legacy compatibility' })
  @Transform(({ value, obj }) => cleanString(value ?? obj.signupSessionId ?? obj.signupSessionToken))
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
