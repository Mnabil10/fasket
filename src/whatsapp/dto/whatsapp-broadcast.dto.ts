import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum WhatsappBroadcastTarget {
  ALL_CUSTOMERS = 'ALL_CUSTOMERS',
  LAST_CUSTOMERS = 'LAST_CUSTOMERS',
  LAST_ORDERS = 'LAST_ORDERS',
  RANDOM_CUSTOMERS = 'RANDOM_CUSTOMERS',
  PHONES = 'PHONES',
}

export class WhatsappBroadcastDto {
  @ApiProperty({ enum: WhatsappBroadcastTarget })
  @IsEnum(WhatsappBroadcastTarget)
  target!: WhatsappBroadcastTarget;

  @ApiProperty()
  @IsString()
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @ApiPropertyOptional({ description: 'ISO 8601 datetime for scheduling' })
  @IsOptional()
  @IsDateString()
  sendAt?: string;
}
