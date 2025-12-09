import { HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/cache/cache.service';
import { UploadsService } from '../uploads/uploads.service';
import { SettingsService } from '../settings/settings.service';
export declare class HealthController {
    private readonly health;
    private readonly prisma;
    private readonly config;
    private readonly cache;
    private readonly uploads;
    private readonly settings;
    private readonly logger;
    constructor(health: HealthCheckService, prisma: PrismaService, config: ConfigService, cache: CacheService, uploads: UploadsService, settings: SettingsService);
    private redisEnabled;
    private prismaCheck;
    private redisCheck;
    private queueCheck;
    private queueMetrics;
    healthcheck(): Promise<import("@nestjs/terminus").HealthCheckResult>;
    monitorProbe(): {
        ok: boolean;
    };
    acmePing(): string;
    metrics(): Promise<{
        uptimeSeconds: number;
        timestamp: string;
        node: string;
        memory: {
            rss: number;
            heapUsed: number;
            heapTotal: number;
        };
        services: {
            redis: string;
            queue: string;
            postgres: string;
            uploads: string;
        };
        queue: {
            enabled: boolean;
            error?: undefined;
            counts?: undefined;
            queueLagMs?: undefined;
        } | {
            enabled: boolean;
            error: string;
            counts?: undefined;
            queueLagMs?: undefined;
        } | {
            enabled: boolean;
            counts: {
                [index: string]: number;
            };
            queueLagMs: number;
            error?: undefined;
        };
        cache: {
            hits: number;
            misses: number;
            hitRate: number;
            total: number;
        };
        orders: {
            lastHour: number;
            lastDay: number;
        };
        deliveryZones: {
            issues: {
                id: string;
                issues: string[];
                isActive: boolean;
            }[];
        };
    }>;
}
