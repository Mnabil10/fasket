import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { AppConfigController } from './app-config.controller';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SettingsService],
  controllers: [SettingsController, AppConfigController],
  exports: [SettingsService],
})
export class SettingsModule {}
