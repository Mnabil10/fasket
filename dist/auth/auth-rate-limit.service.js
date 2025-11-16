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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRateLimitService = void 0;
const cache_manager_1 = require("@nestjs/cache-manager");
const common_1 = require("@nestjs/common");
let AuthRateLimitService = class AuthRateLimitService {
    constructor(cache) {
        this.cache = cache;
        this.ttl = Number(process.env.AUTH_BRUTE_TTL ?? 300);
        this.maxAttempts = Number(process.env.AUTH_BRUTE_MAX ?? 5);
    }
    key(identifier, ip) {
        const normalized = identifier.toLowerCase();
        return `auth:attempts:${normalized}:${ip ?? 'unknown'}`;
    }
    async trackFailure(identifier, ip) {
        if (!identifier)
            return;
        const key = this.key(identifier, ip);
        const record = ((await this.cache.get(key)) ?? {
            attempts: 0,
            lastAttempt: Date.now(),
        });
        record.attempts += 1;
        record.lastAttempt = Date.now();
        await this.cache.set(key, record, this.ttl);
    }
    async reset(identifier, ip) {
        if (!identifier)
            return;
        await this.cache.del(this.key(identifier, ip));
    }
    async ensureCanAttempt(identifier, ip) {
        if (!identifier) {
            throw new common_1.BadRequestException('Identifier is required');
        }
        const record = await this.cache.get(this.key(identifier, ip));
        if (record && record.attempts >= this.maxAttempts) {
            throw new common_1.HttpException(`Too many attempts. Try again in ${Math.ceil(this.ttl / 60)} minutes`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
};
exports.AuthRateLimitService = AuthRateLimitService;
exports.AuthRateLimitService = AuthRateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object])
], AuthRateLimitService);
//# sourceMappingURL=auth-rate-limit.service.js.map