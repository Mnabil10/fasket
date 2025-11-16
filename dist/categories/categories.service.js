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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const image_util_1 = require("../uploads/image.util");
const cache_service_1 = require("../common/cache/cache.service");
const localize_util_1 = require("../common/utils/localize.util");
let CategoriesService = class CategoriesService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
        this.ttl = Number(process.env.CATEGORIES_CACHE_TTL ?? 60);
    }
    async listActive(query) {
        const sort = query.sort ?? 'asc';
        const lang = query.lang ?? 'en';
        const cacheKey = this.cache.buildKey('categories:active', lang, query.q ?? '', query.page, query.pageSize, sort);
        return this.cache.wrap(cacheKey, async () => {
            const where = { isActive: true, deletedAt: null };
            if (query.q) {
                where.OR = [
                    { name: { contains: query.q, mode: 'insensitive' } },
                    { slug: { contains: query.q, mode: 'insensitive' } },
                ];
            }
            const [items, total] = await this.prisma.$transaction([
                this.prisma.category.findMany({
                    where,
                    orderBy: [{ sortOrder: sort }, { name: sort }],
                    select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, parentId: true },
                    skip: query.skip,
                    take: query.take,
                }),
                this.prisma.category.count({ where }),
            ]);
            const mapped = await Promise.all(items.map(async (c) => ({
                ...c,
                name: (0, localize_util_1.localize)(c.name, c.nameAr, lang),
                imageUrl: await (0, image_util_1.toPublicImageUrl)(c.imageUrl),
            })));
            return { items: mapped, total, page: query.page, pageSize: query.pageSize };
        }, this.ttl);
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, cache_service_1.CacheService])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map