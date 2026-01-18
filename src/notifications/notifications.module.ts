import { Logger, Module, forwardRef } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsProcessor } from './notifications.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsGateway } from './notifications.gateway';

// Ensure .env is loaded before evaluating the flag
dotenv.config();

const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') !== 'false';

const queueImports = redisEnabled
  ? [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const redisUrl = config.get<string>('REDIS_URL');
          const connection = redisUrl
            ? { url: redisUrl }
            : {
                host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
                port: Number(config.get('REDIS_PORT') ?? 6379),
              };
          return {
            connection,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: 25,
              removeOnFail: 50,
            },
          };
        },
      }),
      BullModule.registerQueue({
        name: 'notifications',
      }),
    ]
  : [];

const queueProviders = redisEnabled
  ? [NotificationsProcessor]
  : [
      {
        provide: getQueueToken('notifications'),
        useFactory: () => {
          const logger = new Logger('NotificationsQueue');
          logger.warn('Notifications queue disabled (REDIS_ENABLED=false), jobs will be skipped');
          return {
            add: async (name: string, payload: any) => {
              logger.debug({ msg: 'Skipping notification job (queue disabled)', name, payload });
              return { id: 'noop' } as any;
            },
            __notificationsDisabled: true,
          };
        },
      },
      NotificationsProcessor,
    ];

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WhatsappModule),
    SettingsModule,
    JwtModule.register({}),
    ...queueImports,
  ],
  providers: [NotificationsService, NotificationsGateway, ...queueProviders],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
