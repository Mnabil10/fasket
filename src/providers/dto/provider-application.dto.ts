import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryMode, ProviderType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { cleanNullableString, cleanString } from '../../common/utils/sanitize.util';
import { normalizePhoneToE164 } from '../../common/utils/phone.util';

export class CreateProviderApplicationDto {
  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  businessName!: string;

  @ApiProperty({ enum: ProviderType })
  @IsEnum(ProviderType)
  providerType!: ProviderType;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty()
  @Transform(({ value }) => cleanString(value))
  @IsString()
  ownerName!: string;

  @ApiProperty()
  @Transform(({ value }) => normalizePhoneToE164(cleanString(value)))
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: DeliveryMode, default: DeliveryMode.PLATFORM })
  @IsOptional()
  @IsEnum(DeliveryMode)
  deliveryMode?: DeliveryMode = DeliveryMode.PLATFORM;

  @ApiPropertyOptional()
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  notes?: string;
}
