import { Module } from '@nestjs/common';
import { DeliveryDriversService } from './delivery-drivers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DeliveryDriversService],
  exports: [DeliveryDriversService],
})
export class DeliveryDriversModule {}
