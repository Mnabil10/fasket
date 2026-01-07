import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { ProviderOrdersController } from './provider-orders.controller';
import { OrdersService } from './orders.service';
import { AutomationModule } from '../automation/automation.module';
import { ReceiptService } from './receipt.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersStuckWatcher } from './orders-stuck.watcher';
import { BillingModule } from '../billing/billing.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [AutomationModule, PrismaModule, BillingModule, FinanceModule],
  controllers: [OrdersController, GuestOrdersController, ProviderOrdersController],
  providers: [OrdersService, ReceiptService, OrdersStuckWatcher],
  exports: [OrdersService, ReceiptService, OrdersStuckWatcher],
})
export class OrdersModule {}
