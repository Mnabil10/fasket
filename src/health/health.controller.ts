import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

@Controller({ path: '', version: ['1', '2'] })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private redisEnabled() {
    return (this.config.get<string>('REDIS_ENABLED') ?? 'true') !== 'false';
  }

  private async prismaCheck(): Promise<HealthIndicatorResult> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { postgres: { status: 'up' } };
  }

  private async redisCheck(): Promise<HealthIndicatorResult> {
    if (!this.redisEnabled()) return { redis: { status: 'down', message: 'disabled' } };
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) return { redis: { status: 'down', message: 'REDIS_URL missing' } };
    const client = new Redis(redisUrl, { lazyConnect: true });
    try {
      await client.connect();
      await client.ping();
      return { redis: { status: 'up' } };
    } finally {
      await client.disconnect();
    }
  }

  private async queueCheck(): Promise<HealthIndicatorResult> {
    if (!this.redisEnabled()) return { notificationsQueue: { status: 'down', message: 'disabled' } };
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) return { notificationsQueue: { status: 'down', message: 'REDIS_URL missing' } };
    const queue = new Queue('notifications', { connection: { url: redisUrl } });
    try {
      await queue.getJobs(['active'], 0, 0);
      return { notificationsQueue: { status: 'up' } };
    } finally {
      await queue.close();
    }
  }

  @Get('health')
  @HealthCheck()
  async healthcheck() {
    return this.health.check([
      () => this.prismaCheck(),
      () => this.redisCheck(),
      () => this.queueCheck(),
    ]);
  }
}
