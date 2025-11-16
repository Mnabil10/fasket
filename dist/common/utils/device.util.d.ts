export declare function buildDeviceInfo(userAgent?: string | null): {
    userAgent: string;
    browser: string;
    os: string;
    device: "console" | "desktop" | "embedded" | "mobile" | "smarttv" | "tablet" | "wearable" | "xr";
} | undefined;
