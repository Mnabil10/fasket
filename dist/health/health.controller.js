"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var HealthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const prisma_service_1 = require("../prisma/prisma.service");
const ioredis_1 = require("ioredis");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const process_1 = require("process");
const common_2 = require("@nestjs/common");
const cache_service_1 = require("../common/cache/cache.service");
const uploads_service_1 = require("../uploads/uploads.service");
const settings_service_1 = require("../settings/settings.service");
let HealthController = HealthController_1 = class HealthController {
    constructor(health, prisma, config, cache, uploads, settings) {
        this.health = health;
        this.prisma = prisma;
        this.config = config;
        this.cache = cache;
        this.uploads = uploads;
        this.settings = settings;
        this.logger = new common_2.Logger(HealthController_1.name);
    }
    redisEnabled() {
        return (this.config.get('REDIS_ENABLED') ?? 'true') !== 'false';
    }
    async prismaCheck() {
        await this.prisma.$queryRaw `SELECT 1`;
        return { postgres: { status: 'up' } };
    }
    async redisCheck() {
        if (!this.redisEnabled())
            return { redis: { status: 'down', message: 'disabled' } };
        const redisUrl = this.config.get('REDIS_URL');
        if (!redisUrl)
            return { redis: { status: 'down', message: 'REDIS_URL missing' } };
        const client = new ioredis_1.default(redisUrl, { lazyConnect: true });
        try {
            await client.connect();
            await client.ping();
            return { redis: { status: 'up' } };
        }
        finally {
            await client.disconnect();
        }
    }
    async queueCheck() {
        if (!this.redisEnabled())
            return { notificationsQueue: { status: 'down', message: 'disabled' } };
        const redisUrl = this.config.get('REDIS_URL');
        if (!redisUrl)
            return { notificationsQueue: { status: 'down', message: 'REDIS_URL missing' } };
        const queue = new bullmq_1.Queue('notifications', { connection: { url: redisUrl } });
        try {
            await queue.getJobs(['active'], 0, 0);
            return { notificationsQueue: { status: 'up' } };
        }
        finally {
            await queue.close();
        }
    }
    async queueMetrics() {
        if (!this.redisEnabled())
            return { enabled: false };
        const redisUrl = this.config.get('REDIS_URL');
        if (!redisUrl)
            return { enabled: false, error: 'REDIS_URL missing' };
        const queue = new bullmq_1.Queue('notifications', { connection: { url: redisUrl } });
        try {
            const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
            const waitingJobs = await queue.getJobs(['waiting'], 0, 0);
            const oldest = waitingJobs[0];
            const queueLagMs = oldest?.timestamp ? Date.now() - oldest.timestamp : 0;
            return { enabled: true, counts, queueLagMs };
        }
        finally {
            await queue.close();
        }
    }
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
    monitorProbe() {
        return { ok: true };
    }
    acmePing() {
        return 'ok';
    }
    async metrics() {
        const mem = process.memoryUsage();
        const redisEnabled = this.redisEnabled();
        return {
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            node: process_1.version,
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
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)('health'),
    (0, terminus_1.HealthCheck)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "healthcheck", null);
__decorate([
    (0, common_1.Get)('/monitnow'),
    (0, common_1.Head)('/monitnow'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "monitorProbe", null);
__decorate([
    (0, common_1.Get)('/.well-known/acme-challenge/ping'),
    (0, common_1.Head)('/.well-known/acme-challenge/ping'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "acmePing", null);
__decorate([
    (0, common_1.Get)('metrics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "metrics", null);
exports.HealthController = HealthController = HealthController_1 = __decorate([
    (0, common_1.Controller)({ path: '', version: ['1', '2'] }),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        prisma_service_1.PrismaService,
        config_1.ConfigService,
        cache_service_1.CacheService,
        uploads_service_1.UploadsService,
        settings_service_1.SettingsService])
], HealthController);
//# sourceMappingURL=health.controller.js.map