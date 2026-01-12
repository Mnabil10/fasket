import { OrderStatus } from '@prisma/client';

export class OrderReceiptDto {
  id!: string;
  code!: string;
  createdAt!: Date;
  status!: OrderStatus;
  customer!: { id: string; name: string; phone: string };
  address!: {
    street?: string;
    city?: string;
    region?: string;
    building?: string;
    apartment?: string;
    notes?: string;
    label?: string;
  };
  deliveryZone!: {
    id: string;
    name: string;
    city?: string;
    region?: string;
    deliveryFeeCents: number;
    freeDeliveryThresholdCents?: number | null;
    minOrderCents?: number | null;
    etaMinutes?: number | null;
    isActive?: boolean;
  } | null;
  driver!: {
    id: string;
    fullName: string;
    phone?: string | null;
    vehicleType?: string | null;
    plateNumber?: string | null;
  } | null;
  items!: {
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    options?: {
      optionId?: string | null;
      name: string;
      nameAr?: string | null;
      priceSnapshotCents: number;
      qty: number;
    }[];
  }[];
  scheduledAt?: Date | null;
  deliveryWindow?: {
    id: string;
    name: string;
    nameAr?: string | null;
    startMinutes: number;
    endMinutes: number;
    daysOfWeek: number[];
    minLeadMinutes?: number | null;
    minOrderAmountCents?: number | null;
  } | null;
  subtotalCents!: number;
  couponDiscountCents!: number;
  loyaltyDiscountCents!: number;
  shippingFeeCents!: number;
  totalCents!: number;
  loyaltyPointsRedeemed!: number;
  loyaltyPointsEarned!: number;
  currency!: string;
}
