import { AdminService } from './admin.service';
import { LimitDto, RangeDto, ThresholdDto, TimeSeriesDto } from './dto/dashboard.dto';
import { Prisma } from '@prisma/client';
export declare class AdminDashboardController {
    private svc;
    constructor(svc: AdminService);
    summary(range: RangeDto): Promise<{
        sales: {
            totalRevenueCents: number;
            totalOrders: number;
            avgOrderValueCents: number;
        };
        byStatus: (Prisma.PickEnumerable<Prisma.OrderGroupByOutputType, Prisma.OrderScalarFieldEnum | Prisma.OrderScalarFieldEnum[]> & {
            _count: true | {
                id?: number | undefined;
                code?: number | undefined;
                userId?: number | undefined;
                cartId?: number | undefined;
                addressId?: number | undefined;
                deliveryZoneId?: number | undefined;
                deliveryZoneName?: number | undefined;
                deliveryEtaMinutes?: number | undefined;
                estimatedDeliveryTime?: number | undefined;
                notes?: number | undefined;
                couponCode?: number | undefined;
                subtotalCents?: number | undefined;
                shippingFeeCents?: number | undefined;
                discountCents?: number | undefined;
                loyaltyDiscountCents?: number | undefined;
                loyaltyPointsUsed?: number | undefined;
                loyaltyPointsEarned?: number | undefined;
                totalCents?: number | undefined;
                status?: number | undefined;
                paymentMethod?: number | undefined;
                driverId?: number | undefined;
                driverAssignedAt?: number | undefined;
                createdAt?: number | undefined;
                updatedAt?: number | undefined;
                _all?: number | undefined;
            } | undefined;
            _avg: {
                deliveryEtaMinutes?: number | null | undefined;
                subtotalCents?: number | null | undefined;
                shippingFeeCents?: number | null | undefined;
                discountCents?: number | null | undefined;
                loyaltyDiscountCents?: number | null | undefined;
                loyaltyPointsUsed?: number | null | undefined;
                loyaltyPointsEarned?: number | null | undefined;
                totalCents?: number | null | undefined;
            } | undefined;
            _sum: {
                deliveryEtaMinutes?: number | null | undefined;
                subtotalCents?: number | null | undefined;
                shippingFeeCents?: number | null | undefined;
                discountCents?: number | null | undefined;
                loyaltyDiscountCents?: number | null | undefined;
                loyaltyPointsUsed?: number | null | undefined;
                loyaltyPointsEarned?: number | null | undefined;
                totalCents?: number | null | undefined;
            } | undefined;
            _min: {
                id?: string | null | undefined;
                code?: string | null | undefined;
                userId?: string | null | undefined;
                cartId?: string | null | undefined;
                addressId?: string | null | undefined;
                deliveryZoneId?: string | null | undefined;
                deliveryZoneName?: string | null | undefined;
                deliveryEtaMinutes?: number | null | undefined;
                estimatedDeliveryTime?: string | null | undefined;
                notes?: string | null | undefined;
                couponCode?: string | null | undefined;
                subtotalCents?: number | null | undefined;
                shippingFeeCents?: number | null | undefined;
                discountCents?: number | null | undefined;
                loyaltyDiscountCents?: number | null | undefined;
                loyaltyPointsUsed?: number | null | undefined;
                loyaltyPointsEarned?: number | null | undefined;
                totalCents?: number | null | undefined;
                status?: import(".prisma/client").$Enums.OrderStatus | null | undefined;
                paymentMethod?: import(".prisma/client").$Enums.PaymentMethod | null | undefined;
                driverId?: string | null | undefined;
                driverAssignedAt?: Date | null | undefined;
                createdAt?: Date | null | undefined;
                updatedAt?: Date | null | undefined;
            } | undefined;
            _max: {
                id?: string | null | undefined;
                code?: string | null | undefined;
                userId?: string | null | undefined;
                cartId?: string | null | undefined;
                addressId?: string | null | undefined;
                deliveryZoneId?: string | null | undefined;
                deliveryZoneName?: string | null | undefined;
                deliveryEtaMinutes?: number | null | undefined;
                estimatedDeliveryTime?: string | null | undefined;
                notes?: string | null | undefined;
                couponCode?: string | null | undefined;
                subtotalCents?: number | null | undefined;
                shippingFeeCents?: number | null | undefined;
                discountCents?: number | null | undefined;
                loyaltyDiscountCents?: number | null | undefined;
                loyaltyPointsUsed?: number | null | undefined;
                loyaltyPointsEarned?: number | null | undefined;
                totalCents?: number | null | undefined;
                status?: import(".prisma/client").$Enums.OrderStatus | null | undefined;
                paymentMethod?: import(".prisma/client").$Enums.PaymentMethod | null | undefined;
                driverId?: string | null | undefined;
                driverAssignedAt?: Date | null | undefined;
                createdAt?: Date | null | undefined;
                updatedAt?: Date | null | undefined;
            } | undefined;
        })[];
        recent: {
            status: import(".prisma/client").$Enums.OrderStatus;
            user: {
                phone: string;
                name: string;
            };
            id: string;
            createdAt: Date;
            totalCents: number;
        }[];
        topProducts: {
            productId: string;
            qty: number;
            name: string | undefined;
        }[];
        lowStock: {
            id: string;
            name: string;
            stock: number;
        }[];
        customersCount: number;
    }>;
    timeSeries(q: TimeSeriesDto): Promise<{
        period: string;
        revenueCents: number;
        orders: number;
    }[]>;
    topProducts(range: RangeDto, lim: LimitDto): Promise<{
        productId: string;
        qty: number;
        name: string | undefined;
    }[]>;
    lowStock(thr: ThresholdDto): Promise<{
        id: string;
        name: string;
        stock: number;
    }[]>;
    statusBreakdown(range: RangeDto): Promise<(Prisma.PickEnumerable<Prisma.OrderGroupByOutputType, "status"[]> & {
        _count: {
            status: number;
        };
    })[]>;
}
