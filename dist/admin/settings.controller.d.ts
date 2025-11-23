import { AdminService } from './admin.service';
import { UpdateSettingsDto, GeneralSettingsDto, DeliverySettingsDto, PaymentSettingsDto, NotificationsSettingsDto, SystemSettingsDto, LoyaltySettingsDto } from './dto/settings.dto';
import { SettingsService } from '../settings/settings.service';
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
    update(dto: UpdateSettingsDto): Promise<{
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
    updateGeneral(dto: GeneralSettingsDto): Promise<{
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
    updateDelivery(dto: DeliverySettingsDto): Promise<{
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
    updatePayment(dto: PaymentSettingsDto): Promise<{
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
    updateNotifications(dto: NotificationsSettingsDto): Promise<{
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
    updateLoyalty(dto: LoyaltySettingsDto): Promise<{
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
    updateSystem(dto: SystemSettingsDto): Promise<{
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
