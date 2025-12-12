import { Module } from '@nestjs/common';
import { AutomationSupportController } from './automation-support.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { AutomationSupportService } from './automation-support.service';
import { AutomationModule } from '../automation/automation.module';
import { CommonModule } from '../common/common.module';
import { AutomationHmacGuard } from '../automation/automation-hmac.guard';

@Module({
  imports: [PrismaModule, SettingsModule, AutomationModule, CommonModule],
  controllers: [AutomationSupportController],
  providers: [AutomationSupportService, AutomationHmacGuard],
})
export class AutomationSupportModule {}
