import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignChannel, CampaignStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CampaignListDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ enum: CampaignChannel })
  @IsOptional()
  @IsEnum(CampaignChannel)
  channel?: CampaignChannel;

  @ApiPropertyOptional({ description: 'Search by name or message' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class CampaignCreateDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  message!: string;

  @ApiPropertyOptional({ enum: CampaignChannel, default: CampaignChannel.PUSH })
  @IsOptional()
  @IsEnum(CampaignChannel)
  channel?: CampaignChannel;

  @ApiPropertyOptional({ description: 'ISO schedule timestamp' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  scheduledAt?: Date;

  @ApiPropertyOptional({ description: 'Segment definition (JSON)' })
  @IsOptional()
  segment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Extra payload (JSON)' })
  @IsOptional()
  payload?: Record<string, any>;
}

export class CampaignUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ enum: CampaignChannel })
  @IsOptional()
  @IsEnum(CampaignChannel)
  channel?: CampaignChannel;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  scheduledAt?: Date | null;

  @ApiPropertyOptional()
  @IsOptional()
  segment?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  payload?: Record<string, any>;
}
