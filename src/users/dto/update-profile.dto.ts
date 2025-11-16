import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { cleanNullableString } from '../../common/utils/sanitize.util';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  @Transform(({ value }) => cleanNullableString(value))
  @IsOptional()
  @IsPhoneNumber('EG')
  phone?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @Transform(({ value }) => cleanNullableString(value, { lowerCase: true }))
  @IsOptional()
  @IsEmail()
  email?: string;
}

