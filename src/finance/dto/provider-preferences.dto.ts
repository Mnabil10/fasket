import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

export class NotificationChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class ProviderNotificationPreferencesDto {
  @ApiPropertyOptional({ type: NotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  newOrders?: NotificationChannelDto;

  @ApiPropertyOptional({ type: NotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  payoutSuccess?: NotificationChannelDto;

  @ApiPropertyOptional({ type: NotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  subscriptionExpiry?: NotificationChannelDto;
}
