import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
