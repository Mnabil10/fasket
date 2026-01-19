import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const toBoolean = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value as any;
};

export class AdminOrderListDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus, description: 'Filter by order status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'ISO date - created at greater than or equal' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date - created at less than or equal' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  to?: Date;

  @ApiPropertyOptional({ description: 'ISO date - updated at greater than or equal' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  updatedAfter?: Date;

  @ApiPropertyOptional({ description: 'Search by customer name/phone/email' })
  @IsOptional()
  @IsString()
  customer?: string;

  @ApiPropertyOptional({ description: 'Minimum totalCents', type: Number })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  minTotalCents?: number;

  @ApiPropertyOptional({ description: 'Maximum totalCents', type: Number })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  maxTotalCents?: number;

  @ApiPropertyOptional({ description: 'Filter by driver id' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Filter orders with or without assigned drivers' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  hasDriver?: boolean;

  @ApiPropertyOptional({ description: 'Filter by provider id' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Filter by order group id' })
  @IsOptional()
  @IsString()
  orderGroupId?: string;

  @ApiPropertyOptional({ description: 'Filter by delivery zone id' })
  @IsOptional()
  @IsString()
  deliveryZoneId?: string;
}
