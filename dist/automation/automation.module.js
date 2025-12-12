"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const prisma_module_1 = require("../prisma/prisma.module");
const automation_events_service_1 = require("./automation-events.service");
const automation_processor_1 = require("./automation.processor");
const dotenv = require("dotenv");
dotenv.config();
const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') !== 'false';
const queueImports = redisEnabled
    ? [
        bullmq_1.BullModule.registerQueue({
            name: 'automation-events',
        }),
    ]
    : [];
const queueProviders = redisEnabled
    ? [automation_processor_1.AutomationProcessor]
    : [
        {
            provide: (0, bullmq_1.getQueueToken)('automation-events'),
            useFactory: () => {
                const logger = new common_1.Logger('AutomationQueue');
                logger.warn('Automation queue disabled (REDIS_ENABLED=false); events will be processed inline');
                return {
                    __automationDisabled: true,
                    add: async (_name, _payload, _opts) => {
                        logger.debug({ msg: 'Queue disabled; skipping enqueue', payload: _payload });
                        return { id: 'noop' };
                    },
                };
            },
        },
        automation_processor_1.AutomationProcessor,
    ];
let AutomationModule = class AutomationModule {
};
exports.AutomationModule = AutomationModule;
exports.AutomationModule = AutomationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            ...queueImports,
        ],
        providers: [automation_events_service_1.AutomationEventsService, ...queueProviders],
        exports: [automation_events_service_1.AutomationEventsService],
    })
], AutomationModule);
//# sourceMappingURL=automation.module.js.map