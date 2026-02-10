import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { RetentionScheduler } from './retention.scheduler';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, SettingsModule, NotificationsModule, WhatsappModule, AnalyticsModule],
  controllers: [GrowthController],
  providers: [GrowthService, RetentionScheduler],
})
export class GrowthModule {}
