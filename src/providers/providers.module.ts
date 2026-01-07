import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationModule } from '../automation/automation.module';
import { ProviderController } from './provider.controller';
import { ProviderApplicationsController } from './provider-applications.controller';
import { ProviderApplicationsService } from './provider-applications.service';
import { PublicProvidersController } from './public-providers.controller';

@Module({
  imports: [PrismaModule, AutomationModule],
  controllers: [ProviderController, ProviderApplicationsController, PublicProvidersController],
  providers: [ProviderApplicationsService],
  exports: [ProviderApplicationsService],
})
export class ProvidersModule {}
