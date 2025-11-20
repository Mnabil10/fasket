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
let NotificationsProcessor = NotificationsProcessor_1 = class NotificationsProcessor extends bullmq_1.WorkerHost {
    constructor(prisma) {
        super();
        this.prisma = prisma;
        this.logger = new common_1.Logger(NotificationsProcessor_1.name);
    }
    async process(job) {
        const payload = job.data;
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
        for (const device of devices) {
            const notification = await this.buildMessage(payload, device.language ?? 'en');
            this.logger.log({
                msg: 'Dispatching push notification',
                userId: payload.userId,
                platform: device.platform,
                language: device.language,
                key: payload.key,
                title: notification.title,
            });
        }
        await this.prisma.pushDevice.updateMany({
            where: { userId: payload.userId, token: { in: devices.map((device) => device.token) } },
            data: { lastActiveAt: new Date() },
        });
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
};
exports.NotificationsProcessor = NotificationsProcessor;
exports.NotificationsProcessor = NotificationsProcessor = NotificationsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('notifications'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsProcessor);
//# sourceMappingURL=notifications.processor.js.map