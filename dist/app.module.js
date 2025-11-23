"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const cache_manager_1 = require("@nestjs/cache-manager");
const nestjs_pino_1 = require("nestjs-pino");
const cache_manager_ioredis_yet_1 = require("cache-manager-ioredis-yet");
const terminus_1 = require("@nestjs/terminus");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const addresses_module_1 = require("./addresses/addresses.module");
const categories_module_1 = require("./categories/categories.module");
const products_module_1 = require("./products/products.module");
const cart_module_1 = require("./cart/cart.module");
const orders_module_1 = require("./orders/orders.module");
const admin_module_1 = require("./admin/admin.module");
const notifications_module_1 = require("./notifications/notifications.module");
const app_controller_1 = require("./app.controller");
const health_controller_1 = require("./health/health.controller");
const common_module_1 = require("./common/common.module");
const env_validation_1 = require("./config/env.validation");
const settings_module_1 = require("./settings/settings.module");
const loyalty_module_1 = require("./loyalty/loyalty.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, validate: env_validation_1.validateEnv, expandVariables: true }),
            terminus_1.TerminusModule,
            nestjs_pino_1.LoggerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    pinoHttp: {
                        level: config.get('LOG_LEVEL') || (config.get('NODE_ENV') === 'production' ? 'info' : 'debug'),
                        redact: ['req.headers.authorization'],
                        transport: config.get('NODE_ENV') !== 'production'
                            ? {
                                target: 'pino-pretty',
                                options: { colorize: true, singleLine: true },
                            }
                            : undefined,
                    },
                }),
            }),
            cache_manager_1.CacheModule.registerAsync({
                isGlobal: true,
                inject: [config_1.ConfigService],
                useFactory: async (config) => {
                    const logger = new common_1.Logger('Cache');
                    const ttl = Number(config.get('CACHE_DEFAULT_TTL') ?? 60);
                    const redisEnabled = (config.get('REDIS_ENABLED') ?? 'true') !== 'false';
                    const redisUrl = redisEnabled ? config.get('REDIS_URL') : undefined;
                    if (redisEnabled && redisUrl) {
                        let client = null;
                        try {
                            client = new ioredis_1.default(redisUrl, {
                                lazyConnect: true,
                                maxRetriesPerRequest: 0,
                                enableOfflineQueue: false,
                                retryStrategy: () => null,
                            });
                            client.on('error', (err) => logger.warn(`Redis cache error: ${err.message}`));
                            await client.connect();
                            const store = await (0, cache_manager_ioredis_yet_1.redisStore)({ client, ttl });
                            logger.log(`Cache connected to Redis at ${redisUrl}`);
                            return { store };
                        }
                        catch (err) {
                            logger.warn(`Redis cache disabled (connection failed): ${err.message}`);
                            if (client) {
                                try {
                                    await client.disconnect();
                                }
                                catch {
                                }
                            }
                        }
                    }
                    else if (!redisEnabled) {
                        logger.warn('Redis cache disabled via REDIS_ENABLED=false');
                    }
                    return { ttl };
                },
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => [
                    {
                        ttl: parseInt(String(config.get('RATE_LIMIT_TTL') ?? 60), 10),
                        limit: parseInt(String(config.get('RATE_LIMIT_MAX') ?? 100), 10),
                    },
                    { name: 'authLogin', ttl: 60, limit: 10 },
                    { name: 'authRegister', ttl: 60, limit: 5 },
                    { name: 'uploadsAdmin', ttl: 60, limit: 30 },
                ],
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            addresses_module_1.AddressesModule,
            categories_module_1.CategoriesModule,
            products_module_1.ProductsModule,
            cart_module_1.CartModule,
            orders_module_1.OrdersModule,
            admin_module_1.AdminModule,
            notifications_module_1.NotificationsModule,
            settings_module_1.SettingsModule,
            loyalty_module_1.LoyaltyModule,
            common_module_1.CommonModule,
        ],
        controllers: [app_controller_1.AppController, health_controller_1.HealthController],
        providers: [
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map