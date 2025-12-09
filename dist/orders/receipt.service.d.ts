import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderReceiptDto } from './dto/receipt.dto';
import { CacheService } from '../common/cache/cache.service';
export declare class ReceiptService {
    private readonly prisma;
    private readonly settings;
    private readonly cache;
    constructor(prisma: PrismaService, settings: SettingsService, cache: CacheService);
    getForCustomer(orderId: string, userId: string): Promise<OrderReceiptDto>;
    getForAdmin(orderId: string): Promise<OrderReceiptDto>;
    private buildReceipt;
}
