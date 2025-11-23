export declare class RegisterDeviceDto {
    token: string;
    platform?: 'ios' | 'android' | 'web' | 'unknown';
    language?: string;
    appVersion?: string;
    deviceModel?: string;
    preferences?: Record<string, any>;
    userId?: string;
}
export declare class UnregisterDeviceDto {
    token: string;
}
