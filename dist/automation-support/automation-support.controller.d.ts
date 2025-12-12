import { AutomationSupportService } from './automation-support.service';
import { Request } from 'express';
declare class SupportOrderStatusDto {
    phone: string;
    orderCode?: string;
    last4?: string;
}
declare class SupportProductSearchDto {
    q: string;
}
export declare class AutomationSupportController {
    private readonly support;
    constructor(support: AutomationSupportService);
    orderStatus(dto: SupportOrderStatusDto, req: Request): Promise<{
        orders: {
            orderCode: any;
            status: string;
            etaMinutes: any;
            itemsSummary: any;
            totalFormatted: string;
            createdAt: any;
            driver: {
                name: any;
                phoneMasked: string;
            } | null;
        }[];
    }>;
    productSearch(dto: SupportProductSearchDto, req: Request): Promise<{
        items: {
            id: string;
            sku: string | null;
            name: string;
            priceCents: number;
            available: boolean;
        }[];
    }>;
    deliveryZones(): Promise<{
        id: string;
        name: string;
    }[]>;
}
export {};
