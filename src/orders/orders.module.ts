import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { OrdersService } from './orders.service';
import { AutomationModule } from '../automation/automation.module';
import { ReceiptService } from './receipt.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersStuckWatcher } from './orders-stuck.watcher';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AutomationModule, PrismaModule, BillingModule],
  controllers: [OrdersController, GuestOrdersController],
  providers: [OrdersService, ReceiptService, OrdersStuckWatcher],
  exports: [OrdersService, ReceiptService, OrdersStuckWatcher],
})
export class OrdersModule {}
