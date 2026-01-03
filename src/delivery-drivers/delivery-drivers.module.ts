import { Module } from '@nestjs/common';
import { DeliveryDriversService } from './delivery-drivers.service';
import { InternalDriversController } from './delivery-drivers.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InternalDriversController],
  providers: [DeliveryDriversService],
  exports: [DeliveryDriversService],
})
export class DeliveryDriversModule {}
