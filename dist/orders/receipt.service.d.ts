import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderReceiptDto } from './dto/receipt.dto';
export declare class ReceiptService {
    private readonly prisma;
    private readonly settings;
    constructor(prisma: PrismaService, settings: SettingsService);
    getForCustomer(orderId: string, userId: string): Promise<OrderReceiptDto>;
    getForAdmin(orderId: string): Promise<OrderReceiptDto>;
    private buildReceipt;
}
