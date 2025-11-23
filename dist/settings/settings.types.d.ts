export interface DeliveryZone {
    id: string;
    nameEn: string;
    nameAr: string;
    city?: string;
    region?: string;
    feeCents: number;
    etaMinutes?: number;
    freeDeliveryThresholdCents?: number;
    minOrderAmountCents?: number;
    isActive: boolean;
}
export interface DeliveryConfig {
    deliveryFeeCents: number;
    freeDeliveryMinimumCents: number;
    estimatedDeliveryTime?: string | null;
    maxDeliveryRadiusKm?: number | null;
    deliveryZones: DeliveryZone[];
}
export interface LoyaltyConfig {
    enabled: boolean;
    earnRate: number;
    earnPoints: number;
    earnPerCents: number;
    redeemRateValue: number;
    redeemRate: number;
    redeemUnitCents: number;
    minRedeemPoints: number;
    maxDiscountPercent: number;
    maxRedeemPerOrder: number;
    resetThreshold: number;
}
export interface DeliveryQuote {
    shippingFeeCents: number;
    deliveryZoneId?: string;
    deliveryZoneName?: string;
    etaMinutes?: number;
    estimatedDeliveryTime?: string | null;
}
