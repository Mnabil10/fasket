import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { normalizePhoneToE164 } from '../../common/utils/phone.util';

const toBoolean = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value as any;
};

export class UpsertVehicleDto {
  @ApiProperty({ description: 'bike, car, scooter, etc.' })
  @IsString()
  type!: string;

  @ApiProperty()
  @IsString()
  plateNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateDriverDto {
  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiProperty({ description: 'E.164 phone format' })
  @Transform(({ value }) => normalizePhoneToE164(String(value)))
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ description: 'Government-issued ID' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,}$/)
  nationalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalIdImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Optional login password for driver portal' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  loginPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertVehicleDto)
  vehicle?: UpsertVehicleDto;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class UpdateDriverStatusDto {
  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive!: boolean;
}

export class AssignDriverDto {
  @ApiProperty()
  @IsString()
  driverId!: string;
}
