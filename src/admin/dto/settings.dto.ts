import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DayHoursDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  open?: string; // "09:00"

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  close?: string; // "21:00"

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class BusinessHoursDto {
  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  monday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  tuesday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  wednesday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  thursday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  friday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  saturday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sunday?: DayHoursDto;
}

export class DeliveryZoneDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/i)
  id!: string;

  @ApiProperty()
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ description: 'Delivery fee in store currency', minimum: 0 })
  @IsNumber()
  @Min(0)
  fee!: number;

  @ApiPropertyOptional({ description: 'Override ETA in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CashOnDeliveryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxAmount?: number; // float from UI
}

export class CreditCardsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  acceptedCards?: string[];
}

export class WalletConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;
}

export class DigitalWalletsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => WalletConfigDto)
  paypal?: WalletConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => WalletConfigDto)
  applePay?: WalletConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => WalletConfigDto)
  googlePay?: WalletConfigDto;
}

export class StripeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secretKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class PaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CashOnDeliveryDto)
  cashOnDelivery?: CashOnDeliveryDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardsDto)
  creditCards?: CreditCardsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalWalletsDto)
  digitalWallets?: DigitalWalletsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => StripeDto)
  stripe?: StripeDto;
}

export class OrderNotificationsDto {
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

export class MarketingEmailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  frequency?: string; // e.g., weekly
}

export class LowStockAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  threshold?: number;
}

export class AdminAlertsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LowStockAlertDto)
  lowStock?: LowStockAlertDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  newOrders?: { enabled?: boolean };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  systemUpdates?: { enabled?: boolean };
}

export class NotificationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderNotificationsDto)
  orderNotifications?: OrderNotificationsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketingEmailsDto)
  marketingEmails?: MarketingEmailsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminAlertsDto)
  adminAlerts?: AdminAlertsDto;
}

export class GeneralSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeAddress?: string;

  @ApiPropertyOptional({ type: BusinessHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDto)
  businessHours?: BusinessHoursDto;
}

export class DeliverySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  deliveryFee?: number; // float from UI, stored as cents in DB on save

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  freeDeliveryMinimum?: number; // float from UI, stored as cents in DB on save

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  estimatedDeliveryTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxDeliveryRadius?: number;

  @ApiPropertyOptional({ type: [DeliveryZoneDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneDto)
  deliveryZones?: DeliveryZoneDto[];
}

export class PaymentSettingsDto extends PaymentDto {}
export class NotificationsSettingsDto extends NotificationsDto {}

export class LoyaltySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  earnPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  earnPerCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  redeemRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  redeemUnitCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minRedeemPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedeemPerOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  resetThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  earnRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  redeemRateValue?: number;
}

export class SystemSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRegistrations?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireEmailVerification?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sessionTimeout?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxLoginAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  dataRetentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backupFrequency?: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

/** Full PATCH accepts any section */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: GeneralSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneralSettingsDto)
  general?: GeneralSettingsDto;

  @ApiPropertyOptional({ type: DeliverySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliverySettingsDto)
  delivery?: DeliverySettingsDto;

  @ApiPropertyOptional({ type: PaymentSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentSettingsDto)
  payment?: PaymentSettingsDto;

  @ApiPropertyOptional({ type: NotificationsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsSettingsDto)
  notifications?: NotificationsSettingsDto;

  @ApiPropertyOptional({ type: LoyaltySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoyaltySettingsDto)
  loyalty?: LoyaltySettingsDto;

  @ApiPropertyOptional({ type: SystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SystemSettingsDto)
  system?: SystemSettingsDto;
}
