import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { cleanNullableString } from '../../common/utils/sanitize.util';
import { normalizePhoneToE164OrNull } from '../../common/utils/phone.util';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  @Transform(({ value }) => normalizePhoneToE164OrNull(cleanNullableString(value)))
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @Transform(({ value }) => cleanNullableString(value, { lowerCase: true }))
  @IsOptional()
  @IsEmail()
  email?: string;
}

