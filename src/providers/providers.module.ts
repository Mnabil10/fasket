import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationModule } from '../automation/automation.module';
import { ProviderController } from './provider.controller';
import { ProviderApplicationsController } from './provider-applications.controller';
import { ProviderApplicationsService } from './provider-applications.service';
import { PublicProvidersController } from './public-providers.controller';
import { ProviderDeliveryWindowsController } from './provider-delivery-windows.controller';
import { ProviderDeliveryZonePricingController } from './provider-delivery-zone-pricing.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AutomationModule, NotificationsModule],
  controllers: [
    ProviderController,
    ProviderApplicationsController,
    PublicProvidersController,
    ProviderDeliveryWindowsController,
    ProviderDeliveryZonePricingController,
  ],
  providers: [ProviderApplicationsService],
  exports: [ProviderApplicationsService],
})
export class ProvidersModule {}
