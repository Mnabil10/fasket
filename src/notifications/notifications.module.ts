import { Logger, Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsProcessor } from './notifications.processor';

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
          };
        },
      },
      NotificationsProcessor,
    ];

@Module({
  imports: [
    PrismaModule,
    ...queueImports,
  ],
  providers: [NotificationsService, ...queueProviders],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
