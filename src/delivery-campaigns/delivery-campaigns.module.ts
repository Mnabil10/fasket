import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryCampaignsService } from './delivery-campaigns.service';

@Module({
  imports: [PrismaModule],
  providers: [DeliveryCampaignsService],
  exports: [DeliveryCampaignsService],
})
export class DeliveryCampaignsModule {}
