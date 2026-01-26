import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingService } from './billing.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { InvoiceImageService } from './invoice-image.service';

@Module({
  imports: [PrismaModule, NotificationsModule, UploadsModule],
  providers: [BillingService, InvoiceImageService],
  exports: [BillingService],
})
export class BillingModule {}
