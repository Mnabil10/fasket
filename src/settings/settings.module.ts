import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { AppConfigController } from './app-config.controller';
import { DeliveryCampaignsModule } from '../delivery-campaigns/delivery-campaigns.module';

@Global()
@Module({
  imports: [PrismaModule, DeliveryCampaignsModule],
  providers: [SettingsService],
  controllers: [SettingsController, AppConfigController],
  exports: [SettingsService],
})
export class SettingsModule {}
