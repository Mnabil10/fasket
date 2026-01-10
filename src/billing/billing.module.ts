import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingService } from './billing.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
