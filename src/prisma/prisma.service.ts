import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import * as Sentry from '@sentry/node';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private readonly statusGuard = new AsyncLocalStorage<{ allow: boolean }>();

  async onModuleInit() {
    await this.$connect();
    // Graceful shutdown
    process.on('beforeExit', async () => {
      await this.$disconnect();
    });

    // Guardrail: log any order status mutations that bypass OrdersService
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model === 'Order' && (params.action === 'update' || params.action === 'updateMany')) {
        const data: any = params.args?.data ?? {};
        if (data.status !== undefined) {
          const ctx = this.statusGuard.getStore();
          const allowed = ctx?.allow === true;
          if (!allowed) {
            const msg = `Order status mutation blocked (use OrdersService.updateStatus). model=${params.model} action=${params.action}`;
            const env = (process.env.NODE_ENV || '').toLowerCase();
            if (env === 'production' || env === 'staging') {
              this.logger.error(msg);
              Sentry.captureMessage(msg, { level: 'error' });
              throw new Error(msg);
            } else {
              this.logger.error(msg);
              Sentry.captureMessage(msg, { level: 'warning' });
            }
          }
        }
      }
      return result;
    });
  }

  async allowStatusUpdates<T>(runner: () => Promise<T>): Promise<T> {
    return this.statusGuard.run({ allow: true }, runner);
  }
}
