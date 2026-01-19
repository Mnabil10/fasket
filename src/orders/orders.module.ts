import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrdersController } from './orders.controller';
import { OrderGroupsController } from './order-groups.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { ProviderOrdersController } from './provider-orders.controller';
import { OrdersService } from './orders.service';
import { AutomationModule } from '../automation/automation.module';
import { ReceiptService } from './receipt.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersStuckWatcher } from './orders-stuck.watcher';
import { OrdersGateway } from './orders.gateway';
import { BillingModule } from '../billing/billing.module';
import { FinanceModule } from '../finance/finance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [AutomationModule, PrismaModule, BillingModule, FinanceModule, NotificationsModule, OtpModule, JwtModule.register({})],
  controllers: [OrdersController, OrderGroupsController, GuestOrdersController, ProviderOrdersController],
  providers: [OrdersService, ReceiptService, OrdersStuckWatcher, OrdersGateway],
  exports: [OrdersService, ReceiptService, OrdersStuckWatcher],
})
export class OrdersModule {}
