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
exports.CacheService = void 0;
const cache_manager_1 = require("@nestjs/cache-manager");
const common_1 = require("@nestjs/common");
let CacheService = class CacheService {
    constructor(cache) {
        this.cache = cache;
        this.defaultTtl = Number(process.env.CACHE_DEFAULT_TTL ?? 60);
    }
    buildKey(namespace, ...parts) {
        const normalized = parts
            .map((part) => this.normalizePart(part))
            .filter((part) => part.length > 0);
        return [namespace, ...normalized].join(':');
    }
    async wrap(key, handler, ttl) {
        const cached = await this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const value = await handler();
        await this.set(key, value, ttl);
        return value;
    }
    async get(key) {
        const value = await this.cache.get(key);
        return value === undefined ? undefined : value;
    }
    async set(key, value, ttl) {
        const effectiveTtl = ttl ?? this.defaultTtl;
        if (effectiveTtl <= 0)
            return;
        await this.cache.set(key, value, effectiveTtl);
    }
    async del(key) {
        await this.cache.del(key);
    }
    async deleteMatching(pattern) {
        const store = this.cache.store;
        if (typeof store?.keys === 'function') {
            const keys = await store.keys(pattern);
            if (keys?.length) {
                await Promise.all(keys.map((key) => this.cache.del(key)));
            }
            return;
        }
        const reset = this.cache.reset;
        if (typeof reset === 'function') {
            await reset.call(this.cache);
        }
    }
    normalizePart(part) {
        if (part === null || part === undefined)
            return '';
        if (typeof part === 'object') {
            const ordered = {};
            Object.keys(part)
                .sort()
                .forEach((key) => {
                ordered[key] = part[key];
            });
            return JSON.stringify(ordered);
        }
        return String(part);
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object])
], CacheService);
//# sourceMappingURL=cache.service.js.map