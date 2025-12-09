import { AdminService } from './admin.service';
import { UpdateSettingsDto, GeneralSettingsDto, DeliverySettingsDto, PaymentSettingsDto, NotificationsSettingsDto, SystemSettingsDto, LoyaltySettingsDto } from './dto/settings.dto';
import { SettingsService } from '../settings/settings.service';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class AdminSettingsController {
    private readonly svc;
    private readonly settingsService;
    private readonly logger;
    constructor(svc: AdminService, settingsService: SettingsService);
    private getOrCreate;
    private toUi;
    private toUpdate;
    private transformDeliveryZones;
    get(): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    update(user: CurrentUserPayload, dto: UpdateSettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updateGeneral(user: CurrentUserPayload, dto: GeneralSettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updateDelivery(user: CurrentUserPayload, dto: DeliverySettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updatePayment(user: CurrentUserPayload, dto: PaymentSettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updateNotifications(user: CurrentUserPayload, dto: NotificationsSettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updateLoyalty(user: CurrentUserPayload, dto: LoyaltySettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
    updateSystem(user: CurrentUserPayload, dto: SystemSettingsDto): Promise<{
        general: {
            storeName: any;
            storeDescription: any;
            contactEmail: any;
            contactPhone: any;
            storeAddress: any;
            businessHours: any;
        };
        delivery: {
            deliveryFee: number;
            freeDeliveryMinimum: number;
            estimatedDeliveryTime: any;
            maxDeliveryRadius: any;
            deliveryZones: {
                id: string;
                nameEn: string;
                nameAr: string;
                city: any;
                region: any;
                fee: number;
                feeCents: number;
                etaMinutes: number | undefined;
                freeDeliveryThresholdCents: any;
                minOrderAmountCents: any;
                isActive: boolean;
                etaTextEn: string | null;
                etaTextAr: string | null;
                feeMessageEn: string;
                feeMessageAr: string;
            }[];
        };
        payment: any;
        notifications: any;
        loyalty: {
            enabled: any;
            earnPoints: any;
            earnPerCents: any;
            redeemRate: any;
            redeemUnitCents: any;
            minRedeemPoints: any;
            maxDiscountPercent: any;
            maxRedeemPerOrder: any;
            resetThreshold: any;
            earnRate: any;
            redeemRateValue: any;
        };
        system: {
            maintenanceMode: any;
            allowRegistrations: any;
            requireEmailVerification: any;
            sessionTimeout: any;
            maxLoginAttempts: any;
            dataRetentionDays: any;
            backupFrequency: any;
            timezone: any;
            language: any;
            currency: any;
        };
        updatedAt: any;
    }>;
}
