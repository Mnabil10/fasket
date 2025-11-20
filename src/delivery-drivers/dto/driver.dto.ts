import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CreateDriverDto {
  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiProperty({ description: 'E.164 phone format' })
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
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
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class UpdateDriverStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

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

export class AssignDriverDto {
  @ApiProperty()
  @IsString()
  driverId!: string;
}
