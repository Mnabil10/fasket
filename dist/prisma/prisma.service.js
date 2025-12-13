"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const async_hooks_1 = require("async_hooks");
const Sentry = require("@sentry/node");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    constructor() {
        super(...arguments);
        this.logger = new common_1.Logger(PrismaService_1.name);
        this.statusGuard = new async_hooks_1.AsyncLocalStorage();
    }
    async onModuleInit() {
        await this.$connect();
        process.on('beforeExit', async () => {
            await this.$disconnect();
        });
        this.$use(async (params, next) => {
            const result = await next(params);
            if (params.model === 'Order' && (params.action === 'update' || params.action === 'updateMany')) {
                const data = params.args?.data ?? {};
                if (data.status !== undefined) {
                    const ctx = this.statusGuard.getStore();
                    const allowed = ctx?.allow === true;
                    if (!allowed) {
                        const msg = `Order status mutation blocked (use OrdersService.updateStatus). model=${params.model} action=${params.action}`;
                        const env = (process.env.NODE_ENV || '').toLowerCase();
                        if (env === 'production' || env === 'staging') {
                            this.logger.error(msg);
                            Sentry.captureMessage(msg, { level: 'error' });
                            throw new Error(msg);
                        }
                        else {
                            this.logger.error(msg);
                            Sentry.captureMessage(msg, { level: 'warning' });
                        }
                    }
                }
            }
            return result;
        });
    }
    async allowStatusUpdates(runner) {
        return this.statusGuard.run({ allow: true }, runner);
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)()
], PrismaService);
//# sourceMappingURL=prisma.service.js.map