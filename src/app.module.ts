import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { redisStore } from 'cache-manager-ioredis-yet';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AppController } from './app.controller';
import { HealthController } from './health/health.controller';
import { CommonModule } from './common/common.module';
import { validateEnv } from './config/env.validation';
import { SettingsModule } from './settings/settings.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { UploadsModule } from './uploads/uploads.module';
import { AutomationModule } from './automation/automation.module';
import { OtpModule } from './otp/otp.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { AutomationSupportModule } from './automation-support/automation-support.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, expandVariables: true }),
    TerminusModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL') || (config.get('NODE_ENV') === 'production' ? 'info' : 'debug'),
          redact: ['req.headers.authorization'],
          transport:
            config.get('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
        },
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('Cache');
        const ttl = Number(config.get('CACHE_DEFAULT_TTL') ?? 60);
        const redisEnabled = (config.get<string>('REDIS_ENABLED') ?? 'true') !== 'false';
        const redisUrl = redisEnabled ? config.get<string>('REDIS_URL') : undefined;

        if (redisEnabled && redisUrl) {
          let client: Redis | null = null;
          try {
            client = new Redis(redisUrl, {
              lazyConnect: true,
              maxRetriesPerRequest: 0,
              enableOfflineQueue: false,
              retryStrategy: () => null, // no infinite reconnect spam
            });
            client.on('error', (err: Error) => logger.warn(`Redis cache error: ${err.message}`));

            await client.connect();
            const store = await redisStore({ client, ttl });
            logger.log(`Cache connected to Redis at ${redisUrl}`);
            return { store };
          } catch (err) {
            logger.warn(`Redis cache disabled (connection failed): ${(err as Error).message}`);
            if (client) {
              try {
                await client.disconnect();
              } catch {
                /* swallow */
              }
            }
          }
        } else if (!redisEnabled) {
          logger.warn('Redis cache disabled via REDIS_ENABLED=false');
        }

        return { ttl };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: parseInt(String(config.get('RATE_LIMIT_TTL') ?? 60), 10),
          limit: parseInt(String(config.get('RATE_LIMIT_MAX') ?? 100), 10),
        },
        { name: 'authLogin', ttl: 60, limit: 10 },
        { name: 'authRegister', ttl: 60, limit: 5 },
        { name: 'uploadsAdmin', ttl: 60, limit: 30 },
        { name: 'supportBot', ttl: 600, limit: 5 },
        { name: 'supportBotSearch', ttl: 600, limit: 10 },
        { name: 'otpRequest', ttl: 600, limit: 10 },
        { name: 'otpVerify', ttl: 600, limit: 20 },
        { name: 'passwordResetRequest', ttl: 600, limit: 5 },
        { name: 'passwordResetConfirm', ttl: 600, limit: 10 },
      ],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    AdminModule,
    NotificationsModule,
    AutomationModule,
    OtpModule,
    PasswordResetModule,
    AutomationSupportModule,
    SettingsModule,
    LoyaltyModule,
    CommonModule,
    UploadsModule,
    TelegramModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
