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
var NotificationsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = require("axios");
let NotificationsProcessor = NotificationsProcessor_1 = class NotificationsProcessor extends bullmq_1.WorkerHost {
    constructor(prisma) {
        super();
        this.prisma = prisma;
        this.logger = new common_1.Logger(NotificationsProcessor_1.name);
        this.provider = process.env.PUSH_PROVIDER ?? 'mock';
        this.fcmKey = process.env.FCM_SERVER_KEY;
        this.onesignalKey = process.env.ONESIGNAL_REST_KEY;
        this.onesignalAppId = process.env.ONESIGNAL_APP_ID;
    }
    async process(job) {
        const payload = job.data;
        const redisStatus = (await this.redisPing().catch(() => 'down'));
        if (redisStatus === 'down') {
            this.logger.warn({ msg: 'Redis unavailable during notification processing' });
        }
        const devices = await this.prisma.pushDevice.findMany({
            where: { userId: payload.userId },
            select: { token: true, platform: true, language: true },
        });
        if (!devices.length) {
            this.logger.debug({
                msg: 'No registered devices for notification',
                userId: payload.userId,
                key: payload.key,
            });
            return;
        }
        const receipts = [];
        for (const device of devices) {
            const notification = await this.buildMessage(payload, device.language ?? 'en');
            const receipt = await this.dispatch(device.token, notification.title, notification.body, payload.data).catch((err) => ({
                status: 'failed',
                provider: this.provider,
                token: device.token,
                error: err.message,
            }));
            receipts.push(receipt);
            this.logger.log({
                msg: 'Dispatching push notification',
                userId: payload.userId,
                platform: device.platform,
                language: device.language,
                key: payload.key,
                title: notification.title,
                receiptStatus: receipt.status,
            });
        }
        await this.prisma.pushDevice.updateMany({
            where: { userId: payload.userId, token: { in: devices.map((device) => device.token) } },
            data: { lastActiveAt: new Date() },
        });
        await this.prisma.notificationTemplate.findFirst();
        return { receipts };
    }
    async buildMessage(payload, lang) {
        const template = (await this.prisma.notificationTemplate.findFirst({
            where: { key: payload.key, language: lang, isActive: true },
        })) ||
            (await this.prisma.notificationTemplate.findFirst({
                where: { key: payload.key, language: 'en', isActive: true },
            }));
        const fallbackTitle = this.render('{{key}}', { key: payload.key });
        const fallbackBody = this.render('Notification: {{key}}', { key: payload.key });
        if (!template) {
            return { title: fallbackTitle, body: fallbackBody, data: payload.data };
        }
        return {
            title: this.render(template.title ?? fallbackTitle, payload.data),
            body: this.render(template.body ?? fallbackBody, payload.data),
            data: payload.data,
        };
    }
    render(tpl, ctx) {
        return tpl.replace(/{{\s*(\w+)\s*}}/g, (_m, key) => {
            const value = ctx[key];
            return value === undefined || value === null ? '' : String(value);
        });
    }
    async redisPing() {
        try {
            const RedisLib = require('ioredis');
            const client = new RedisLib(process.env.REDIS_URL, { lazyConnect: true });
            await client.connect();
            await client.ping();
            await client.disconnect();
            return 'up';
        }
        catch {
            return 'down';
        }
    }
    async dispatch(token, title, body, data) {
        switch (this.provider) {
            case 'fcm':
                if (!this.fcmKey)
                    throw new Error('FCM_SERVER_KEY not configured');
                return this.sendFcm(token, title, body, data);
            case 'onesignal':
                if (!this.onesignalKey || !this.onesignalAppId)
                    throw new Error('ONESIGNAL keys not configured');
                return this.sendOneSignal(token, title, body, data);
            case 'apns':
                throw new Error('APNS provider not implemented');
            default:
                this.logger.debug({ msg: 'Mock push send', token, title, body, data });
                return { status: 'success', provider: 'mock', token, messageId: 'mock' };
        }
    }
    async sendFcm(token, title, body, data) {
        const resp = await axios_1.default.post('https://fcm.googleapis.com/fcm/send', {
            to: token,
            notification: { title, body },
            data: data ?? {},
        }, { headers: { Authorization: `key=${this.fcmKey}`, 'Content-Type': 'application/json' } });
        const messageId = resp.data?.message_id ?? resp.data?.name;
        return { status: 'success', provider: 'fcm', token, messageId };
    }
    async sendOneSignal(token, title, body, data) {
        const resp = await axios_1.default.post('https://api.onesignal.com/notifications', {
            app_id: this.onesignalAppId,
            include_player_ids: [token],
            headings: { en: title ?? '' },
            contents: { en: body ?? '' },
            data: data ?? {},
        }, { headers: { Authorization: `Basic ${this.onesignalKey}`, 'Content-Type': 'application/json' } });
        const messageId = resp.data?.id;
        return { status: 'success', provider: 'onesignal', token, messageId };
    }
};
exports.NotificationsProcessor = NotificationsProcessor;
exports.NotificationsProcessor = NotificationsProcessor = NotificationsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('notifications'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsProcessor);
//# sourceMappingURL=notifications.processor.js.map