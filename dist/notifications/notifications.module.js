"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const config_1 = require("@nestjs/config");
const dotenv = require("dotenv");
const notifications_service_1 = require("./notifications.service");
const notifications_controller_1 = require("./notifications.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const notifications_processor_1 = require("./notifications.processor");
dotenv.config();
const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') !== 'false';
const queueImports = redisEnabled
    ? [
        bullmq_1.BullModule.forRootAsync({
            inject: [config_1.ConfigService],
            useFactory: (config) => {
                const redisUrl = config.get('REDIS_URL');
                const connection = redisUrl
                    ? { url: redisUrl }
                    : {
                        host: config.get('REDIS_HOST') ?? '127.0.0.1',
                        port: Number(config.get('REDIS_PORT') ?? 6379),
                    };
                return {
                    connection,
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 2000 },
                        removeOnComplete: 25,
                        removeOnFail: 50,
                    },
                };
            },
        }),
        bullmq_1.BullModule.registerQueue({
            name: 'notifications',
        }),
    ]
    : [];
const queueProviders = redisEnabled
    ? [notifications_processor_1.NotificationsProcessor]
    : [
        {
            provide: (0, bullmq_1.getQueueToken)('notifications'),
            useFactory: () => {
                const logger = new common_1.Logger('NotificationsQueue');
                logger.warn('Notifications queue disabled (REDIS_ENABLED=false), jobs will be skipped');
                return {
                    add: async (name, payload) => {
                        logger.debug({ msg: 'Skipping notification job (queue disabled)', name, payload });
                        return { id: 'noop' };
                    },
                };
            },
        },
        notifications_processor_1.NotificationsProcessor,
    ];
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            ...queueImports,
        ],
        providers: [notifications_service_1.NotificationsService, ...queueProviders],
        controllers: [notifications_controller_1.NotificationsController],
        exports: [notifications_service_1.NotificationsService],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map