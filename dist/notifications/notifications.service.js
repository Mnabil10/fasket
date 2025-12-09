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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(prisma, queue) {
        this.prisma = prisma;
        this.queue = queue;
        this.logger = new common_1.Logger(NotificationsService_1.name);
    }
    async notify(key, userId, data) {
        await this.enqueue({ key, userId, data });
    }
    async notifyDriverAssigned(userId, orderId, driver) {
        await this.notify('order_assigned_driver', userId, {
            orderId,
            driverId: driver.id,
            driverName: driver.fullName,
            driverPhone: driver.phone,
        });
    }
    async notifyLoyaltyEarned(userId, points, orderId) {
        await this.notify('loyalty_earned', userId, { points, orderId });
    }
    async notifyLoyaltyRedeemed(userId, points, discountCents, orderId) {
        await this.notify('loyalty_redeemed', userId, { points, discountCents, orderId });
    }
    async registerDevice(userId, dto) {
        const normalizedLanguage = dto.language?.toLowerCase() ?? 'en';
        const now = new Date();
        const device = await this.prisma.pushDevice.upsert({
            where: { token: dto.token },
            update: {
                userId,
                platform: dto.platform ?? 'unknown',
                language: normalizedLanguage,
                appVersion: dto.appVersion,
                deviceModel: dto.deviceModel,
                lastActiveAt: now,
            },
            create: {
                userId,
                token: dto.token,
                platform: dto.platform ?? 'unknown',
                language: normalizedLanguage,
                appVersion: dto.appVersion,
                deviceModel: dto.deviceModel,
                lastActiveAt: now,
            },
        });
        this.logger.log({
            msg: 'Registered push device',
            userId,
            platform: device.platform,
        });
        return { success: true, deviceId: device.id };
    }
    async unregisterDevice(userId, token) {
        await this.prisma.pushDevice.deleteMany({
            where: { userId, token },
        });
        this.logger.log({ msg: 'Unregistered push device', userId });
        return { success: true };
    }
    async enqueue(payload) {
        if (!this.queue) {
            const processor = new (require('./notifications.processor').NotificationsProcessor)(this.prisma);
            await processor.process({ data: payload });
            return;
        }
        try {
            await this.queue.add('send', payload, {
                removeOnComplete: 50,
                removeOnFail: 25,
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
            });
        }
        catch (err) {
            const msg = err.message;
            this.logger.warn({ msg: 'Notification queue unavailable, dropping job', error: msg, payload });
        }
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)('notifications')),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_2.Queue])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map