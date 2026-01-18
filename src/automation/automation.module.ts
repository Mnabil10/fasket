import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationEventsService } from './automation-events.service';
import { AutomationProcessor } from './automation.processor';
import { OpsAlertService } from '../ops/ops-alert.service';
import * as dotenv from 'dotenv';
import { NotificationsModule } from '../notifications/notifications.module';

dotenv.config();

const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') !== 'false';

const queueImports = redisEnabled
  ? [
      BullModule.registerQueue({
        name: 'automation-events',
      }),
    ]
  : [];

const queueProviders = redisEnabled
  ? [AutomationProcessor]
  : [
      {
        provide: getQueueToken('automation-events'),
        useFactory: () => {
          const logger = new Logger('AutomationQueue');
          logger.warn('Automation queue disabled (REDIS_ENABLED=false); events will be processed inline');
          return {
            __automationDisabled: true,
            add: async (_name: string, _payload: any, _opts?: any) => {
              logger.debug({ msg: 'Queue disabled; skipping enqueue', payload: _payload });
              return { id: 'noop' } as any;
            },
          };
        },
      },
      AutomationProcessor,
    ];

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => NotificationsModule),
    ...queueImports,
  ],
  providers: [AutomationEventsService, OpsAlertService, ...queueProviders],
  exports: [AutomationEventsService, OpsAlertService],
})
export class AutomationModule {}
