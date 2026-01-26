import { Logger, Module, forwardRef } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { Job } from 'bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappProcessor } from './queue/whatsapp.processor';
import { WhatsappWebhookController } from './webhook/whatsapp-webhook.controller';
import { WhatsappWebhookService } from './webhook/whatsapp-webhook.service';
import { MetaCloudClient } from './clients/meta-cloud.client';
import { MockWhatsappClient } from './clients/mock.client';
import { MessageProClient } from './clients/message-pro.client';
import { WhatsappSupportService } from './whatsapp-support.service';
import { WhatsappSupportController } from './whatsapp-support.controller';
import { WhatsappLogsController } from './whatsapp-logs.controller';
import { WhatsappInstanceController } from './whatsapp-instance.controller';
import { WhatsappBroadcastController } from './whatsapp-broadcast.controller';
import { WhatsappBroadcastService } from './whatsapp-broadcast.service';
import { AutomationSupportModule } from '../automation-support/automation-support.module';
import { WhatsappQueueJob } from './whatsapp.types';

// Ensure .env is loaded before evaluating the flag
dotenv.config();

const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') !== 'false';

const queueImports = redisEnabled
  ? [
      BullModule.registerQueue({
        name: 'whatsapp.send',
      }),
    ]
  : [];

const queueProviders = redisEnabled
  ? [WhatsappProcessor]
  : [
      {
        provide: getQueueToken('whatsapp.send'),
        useFactory: (processor: WhatsappProcessor) => {
          const logger = new Logger('WhatsappQueue');
          logger.warn('WhatsApp queue disabled (REDIS_ENABLED=false); jobs will run inline');
          return {
            add: async (_name: string, payload: WhatsappQueueJob) => {
              await processor.process({ data: payload } as Job<WhatsappQueueJob>);
              return { id: 'inline' } as Job<WhatsappQueueJob>;
            },
          };
        },
        inject: [WhatsappProcessor],
      },
      WhatsappProcessor,
    ];

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => AutomationSupportModule), ...queueImports],
  providers: [
    WhatsappService,
    WhatsappWebhookService,
    WhatsappSupportService,
    WhatsappBroadcastService,
    MetaCloudClient,
    MockWhatsappClient,
    MessageProClient,
    ...queueProviders,
  ],
  controllers: [
    WhatsappWebhookController,
    WhatsappSupportController,
    WhatsappLogsController,
    WhatsappInstanceController,
    WhatsappBroadcastController,
  ],
  exports: [WhatsappService, WhatsappSupportService],
})
export class WhatsappModule {}
