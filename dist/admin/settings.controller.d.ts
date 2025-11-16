import { AdminService } from './admin.service';
import { UpdateSettingsDto, GeneralSettingsDto, DeliverySettingsDto, PaymentSettingsDto, NotificationsSettingsDto, SystemSettingsDto } from './dto/settings.dto';
export declare class AdminSettingsController {
    private svc;
    private readonly logger;
    constructor(svc: AdminService);
    private getOrCreate;
    private toUi;
    private toUpdate;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
            deliveryZones: any;
        };
        payment: any;
        notifications: any;
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
