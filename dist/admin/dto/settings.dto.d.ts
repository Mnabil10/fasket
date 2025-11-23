export declare class DayHoursDto {
    open?: string;
    close?: string;
    enabled?: boolean;
}
export declare class BusinessHoursDto {
    monday?: DayHoursDto;
    tuesday?: DayHoursDto;
    wednesday?: DayHoursDto;
    thursday?: DayHoursDto;
    friday?: DayHoursDto;
    saturday?: DayHoursDto;
    sunday?: DayHoursDto;
}
export declare class DeliveryZoneDto {
    id: string;
    nameEn: string;
    nameAr?: string;
    fee: number;
    etaMinutes?: number;
    isActive?: boolean;
}
export declare class CashOnDeliveryDto {
    enabled?: boolean;
    maxAmount?: number;
}
export declare class CreditCardsDto {
    enabled?: boolean;
    acceptedCards?: string[];
}
export declare class WalletConfigDto {
    enabled?: boolean;
    merchantId?: string;
}
export declare class DigitalWalletsDto {
    paypal?: WalletConfigDto;
    applePay?: WalletConfigDto;
    googlePay?: WalletConfigDto;
}
export declare class StripeDto {
    enabled?: boolean;
    publicKey?: string;
    secretKey?: string;
    webhookSecret?: string;
}
export declare class PaymentDto {
    cashOnDelivery?: CashOnDeliveryDto;
    creditCards?: CreditCardsDto;
    digitalWallets?: DigitalWalletsDto;
    stripe?: StripeDto;
}
export declare class OrderNotificationsDto {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
}
export declare class MarketingEmailsDto {
    enabled?: boolean;
    frequency?: string;
}
export declare class LowStockAlertDto {
    enabled?: boolean;
    threshold?: number;
}
export declare class AdminAlertsDto {
    lowStock?: LowStockAlertDto;
    newOrders?: {
        enabled?: boolean;
    };
    systemUpdates?: {
        enabled?: boolean;
    };
}
export declare class NotificationsDto {
    orderNotifications?: OrderNotificationsDto;
    marketingEmails?: MarketingEmailsDto;
    adminAlerts?: AdminAlertsDto;
}
export declare class GeneralSettingsDto {
    storeName?: string;
    storeDescription?: string;
    contactEmail?: string;
    contactPhone?: string;
    storeAddress?: string;
    businessHours?: BusinessHoursDto;
}
export declare class DeliverySettingsDto {
    deliveryFee?: number;
    deliveryFeeCents?: number;
    freeDeliveryMinimum?: number;
    freeDeliveryMinimumCents?: number;
    estimatedDeliveryTime?: string;
    maxDeliveryRadius?: number;
    deliveryZones?: DeliveryZoneDto[];
}
export declare class PaymentSettingsDto extends PaymentDto {
}
export declare class NotificationsSettingsDto extends NotificationsDto {
}
export declare class LoyaltySettingsDto {
    enabled?: boolean;
    earnPoints?: number;
    earnPerCents?: number;
    redeemRate?: number;
    redeemUnitCents?: number;
    minRedeemPoints?: number;
    maxDiscountPercent?: number;
    maxRedeemPerOrder?: number;
    resetThreshold?: number;
    earnRate?: number;
    redeemRateValue?: number;
}
export declare class SystemSettingsDto {
    maintenanceMode?: boolean;
    allowRegistrations?: boolean;
    requireEmailVerification?: boolean;
    sessionTimeout?: number;
    maxLoginAttempts?: number;
    dataRetentionDays?: number;
    backupFrequency?: 'daily' | 'weekly' | 'monthly';
    timezone?: string;
    language?: string;
    currency?: string;
}
export declare class UpdateSettingsDto {
    general?: GeneralSettingsDto;
    delivery?: DeliverySettingsDto;
    payment?: PaymentSettingsDto;
    notifications?: NotificationsSettingsDto;
    loyalty?: LoyaltySettingsDto;
    system?: SystemSettingsDto;
}
