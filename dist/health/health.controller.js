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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const prisma_service_1 = require("../prisma/prisma.service");
const ioredis_1 = require("ioredis");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
let HealthController = class HealthController {
    constructor(health, prisma, config) {
        this.health = health;
        this.prisma = prisma;
        this.config = config;
    }
    async prismaCheck() {
        await this.prisma.$queryRaw `SELECT 1`;
        return { postgres: { status: 'up' } };
    }
    async redisCheck() {
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
    async healthcheck() {
        return this.health.check([
            () => this.prismaCheck(),
            () => this.redisCheck(),
            () => this.queueCheck(),
        ]);
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
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)({ path: '', version: ['1', '2'] }),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        prisma_service_1.PrismaService,
        config_1.ConfigService])
], HealthController);
//# sourceMappingURL=health.controller.js.map