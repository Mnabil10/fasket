export declare class RegisterDeviceDto {
    token: string;
    platform?: 'ios' | 'android' | 'web' | 'unknown';
    language?: string;
    appVersion?: string;
    deviceModel?: string;
}
export declare class UnregisterDeviceDto {
    token: string;
}
