import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum AdminOrderStatusDto { PENDING='PENDING', PROCESSING='PROCESSING', OUT_FOR_DELIVERY='OUT_FOR_DELIVERY', DELIVERED='DELIVERED', CANCELED='CANCELED' }

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: AdminOrderStatusDto }) @IsEnum(AdminOrderStatusDto) to!: AdminOrderStatusDto;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string; // optional staff id
}
