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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const image_util_1 = require("../uploads/image.util");
let ProductsService = class ProductsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(q) {
        const where = { deletedAt: null };
        if (q?.status)
            where.status = q.status;
        if (q?.categoryId)
            where.categoryId = q.categoryId;
        if (q?.q)
            where.OR = [
                { name: { contains: q.q, mode: 'insensitive' } },
                { slug: { contains: q.q, mode: 'insensitive' } },
            ];
        if (q?.min || q?.max) {
            where.priceCents = {};
            if (q.min)
                where.priceCents.gte = q.min;
            if (q.max)
                where.priceCents.lte = q.max;
        }
        const items = await this.prisma.product.findMany({
            where,
            select: {
                id: true, name: true, nameAr: true, slug: true, imageUrl: true,
                priceCents: true, salePriceCents: true, stock: true, status: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(items.map(async (p) => ({
            ...p,
            name: q.lang === 'ar' && p.nameAr ? p.nameAr : p.name,
            imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl),
        })));
    }
    async one(idOrSlug, lang) {
        const p = await this.prisma.product.findFirst({
            where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
            include: { category: { select: { id: true, name: true, nameAr: true, slug: true } } },
        });
        if (!p)
            return p;
        const name = lang === 'ar' && p.nameAr ? p.nameAr : p.name;
        const categoryName = p.category ? (lang === 'ar' && p.category.nameAr ? p.category.nameAr : p.category.name) : undefined;
        return { ...p, name, category: p.category ? { ...p.category, name: categoryName } : null, imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl) };
    }
    async bestSelling(limit = 10, lang) {
        const agg = await this.prisma.orderItem.groupBy({
            by: ['productId'],
            _sum: { qty: true },
            orderBy: { _sum: { qty: 'desc' } },
            take: limit,
        });
        const ids = agg.map(a => a.productId);
        if (ids.length === 0)
            return [];
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
            select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, priceCents: true, salePriceCents: true },
        });
        const byId = new Map(products.map(p => [p.id, p]));
        const mapped = await Promise.all(agg.map(async (a) => {
            const p = byId.get(a.productId);
            if (!p)
                return null;
            const name = lang === 'ar' && p.nameAr ? p.nameAr : p.name;
            return { ...p, name, totalSold: a._sum.qty ?? 0, imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl) };
        }));
        return mapped.filter(Boolean);
    }
    async hotOffers(limit = 10, lang) {
        const items = await this.prisma.product.findMany({
            where: { isHotOffer: true, status: 'ACTIVE', deletedAt: null },
            select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, priceCents: true, salePriceCents: true },
            orderBy: { updatedAt: 'desc' },
            take: limit,
        });
        return Promise.all(items.map(async (p) => ({ ...p, name: lang === 'ar' && p.nameAr ? p.nameAr : p.name, imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl) })));
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map