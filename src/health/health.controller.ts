import { Controller, Get, Head } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { version as nodeVersion } from 'process';
import { Logger } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { UploadsService } from '../uploads/uploads.service';
import { SettingsService } from '../settings/settings.service';

@Controller({ path: '', version: ['1', '2'] })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly uploads: UploadsService,
    private readonly settings: SettingsService,
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

  private async queueMetrics() {
    if (!this.redisEnabled()) return { enabled: false };
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) return { enabled: false, error: 'REDIS_URL missing' };
    const queue = new Queue('notifications', { connection: { url: redisUrl } });
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      const waitingJobs = await queue.getJobs(['waiting'], 0, 0);
      const oldest = waitingJobs[0];
      const queueLagMs = oldest?.timestamp ? Date.now() - oldest.timestamp : 0;
      return { enabled: true, counts, queueLagMs };
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
      async () => {
        const uploadHealth = await this.uploads.checkHealth();
        return { uploads: { status: uploadHealth?.ok ? 'up' : 'down' } };
      },
    ]);
  }

  @Get('/monitnow')
  @Head('/monitnow')
  monitorProbe() {
    return { ok: true };
  }

  @Get('/.well-known/acme-challenge/ping')
  @Head('/.well-known/acme-challenge/ping')
  acmePing() {
    return 'ok';
  }

  @Get('metrics')
  async metrics() {
    const mem = process.memoryUsage();
    const redisEnabled = this.redisEnabled();
    return {
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      node: nodeVersion,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      services: {
        redis: redisEnabled ? 'enabled' : 'disabled',
        queue: redisEnabled ? 'enabled' : 'disabled',
        postgres: 'enabled',
        uploads: 'enabled',
      },
      queue: await this.queueMetrics(),
      cache: this.cache.stats(),
      orders: {
        lastHour: await this.prisma.order.count({
          where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
        }),
        lastDay: await this.prisma.order.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      },
      deliveryZones: {
        issues: this.settings.validateZoneConfig(await this.settings.getDeliveryZones({ includeInactive: true })),
      },
    };
  }
}
