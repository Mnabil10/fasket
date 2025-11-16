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
exports.CacheInvalidationService = void 0;
const common_1 = require("@nestjs/common");
const cache_service_1 = require("./cache.service");
let CacheInvalidationService = class CacheInvalidationService {
    constructor(cache) {
        this.cache = cache;
    }
    async categoriesChanged() {
        await this.invalidateByPattern('categories:*');
        await this.invalidateByPattern('home:*');
    }
    async productsChanged() {
        await this.invalidateByPattern('products:*');
        await this.invalidateByPattern('home:*');
    }
    async homeSectionsChanged() {
        await this.invalidateByPattern('home:*');
    }
    async invalidateByPattern(pattern) {
        await this.cache.deleteMatching(pattern);
    }
};
exports.CacheInvalidationService = CacheInvalidationService;
exports.CacheInvalidationService = CacheInvalidationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cache_service_1.CacheService])
], CacheInvalidationService);
//# sourceMappingURL=cache-invalidation.service.js.map