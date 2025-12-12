import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AutomationModule } from '../automation/automation.module';
import { ReceiptService } from './receipt.service';

@Module({
  imports: [AutomationModule],
  controllers: [OrdersController],
  providers: [OrdersService, ReceiptService],
  exports: [OrdersService, ReceiptService],
})
export class OrdersModule {}
