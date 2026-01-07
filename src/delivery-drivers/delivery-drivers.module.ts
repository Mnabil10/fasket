import { Module } from '@nestjs/common';
import { DeliveryDriversService } from './delivery-drivers.service';
import { InternalDriversController } from './delivery-drivers.controller';
import { DriverOrdersController } from './driver-orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [InternalDriversController, DriverOrdersController],
  providers: [DeliveryDriversService],
  exports: [DeliveryDriversService],
})
export class DeliveryDriversModule {}
