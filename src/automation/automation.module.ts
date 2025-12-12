import { Logger, Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationEventsService } from './automation-events.service';
import { AutomationProcessor } from './automation.processor';
import * as dotenv from 'dotenv';

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
    ...queueImports,
  ],
  providers: [AutomationEventsService, ...queueProviders],
  exports: [AutomationEventsService],
})
export class AutomationModule {}
