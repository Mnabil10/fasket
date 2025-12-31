import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';

class InvoiceListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter invoices created at or after this ISO date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter invoices created at or before this ISO date' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class InvoiceListRequestDto extends IntersectionType(PaginationDto, InvoiceListQueryDto) {}
