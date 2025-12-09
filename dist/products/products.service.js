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
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const image_util_1 = require("../uploads/image.util");
const public_product_query_dto_1 = require("./dto/public-product-query.dto");
const cache_service_1 = require("../common/cache/cache.service");
const localize_util_1 = require("../common/utils/localize.util");
const categorySelect = {
    id: true,
    name: true,
    nameAr: true,
    slug: true,
};
let ProductsService = class ProductsService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
        this.listTtl = Number(process.env.PRODUCT_LIST_CACHE_TTL ?? 60);
        this.homeTtl = Number(process.env.HOME_CACHE_TTL ?? 120);
        this.swrTtl = Number(process.env.CACHE_SWR_TTL ?? 30);
    }
    async list(q) {
        const page = q.page ?? 1;
        const pageSize = q.pageSize ?? 20;
        const cacheKey = this.cache.buildKey('products:list', q.lang ?? 'en', q.q ?? '', q.categoryId ?? '', q.categorySlug ?? '', q.min ?? '', q.max ?? '', q.orderBy ?? '', q.sort ?? '', page, pageSize);
        return this.cache.wrap(cacheKey, async () => {
            const where = {
                deletedAt: null,
                status: client_1.ProductStatus.ACTIVE,
            };
            if (q?.categoryId)
                where.categoryId = q.categoryId;
            if (q?.categorySlug) {
                const category = await this.prisma.category.findFirst({
                    where: { slug: q.categorySlug, deletedAt: null },
                    select: { id: true },
                });
                if (category)
                    where.categoryId = category.id;
            }
            if (q?.q) {
                where.OR = [
                    { name: { contains: q.q, mode: 'insensitive' } },
                    { slug: { contains: q.q, mode: 'insensitive' } },
                ];
            }
            if (q?.min !== undefined || q?.max !== undefined) {
                const range = {};
                const minCents = q.min !== undefined ? this.toCents(q.min) : undefined;
                const maxCents = q.max !== undefined ? this.toCents(q.max) : undefined;
                if (minCents !== undefined)
                    range.gte = minCents;
                if (maxCents !== undefined)
                    range.lte = maxCents;
                if (Object.keys(range).length) {
                    where.priceCents = range;
                }
            }
            const [items, total] = await this.prisma.$transaction([
                this.prisma.product.findMany({
                    where,
                    include: { category: { select: categorySelect } },
                    orderBy: { [q.orderBy ?? 'createdAt']: q.sort ?? 'desc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                this.prisma.product.count({ where }),
            ]);
            const mapped = await Promise.all(items.map((product) => this.toProductSummary(product, q?.lang)));
            return { items: mapped, total, page, pageSize };
        }, this.listTtl + this.swrTtl);
    }
    async one(idOrSlug, lang) {
        const product = await this.prisma.product.findFirst({
            where: {
                OR: [{ id: idOrSlug }, { slug: idOrSlug }],
                deletedAt: null,
                status: client_1.ProductStatus.ACTIVE,
            },
            include: { category: { select: categorySelect } },
        });
        if (!product)
            return null;
        return this.toProductDetail(product, lang);
    }
    async bestSelling(query = new public_product_query_dto_1.PublicProductFeedDto()) {
        const currentPage = query.page ?? 1;
        const take = query.pageSize ?? 10;
        const lang = query.lang;
        const cacheKey = this.cache.buildKey('home:best', lang ?? 'en', currentPage, take, query.fromDate ?? '', query.toDate ?? '', query.orderBy ?? 'qty', query.sort ?? 'desc');
        return this.cache.wrap(cacheKey, async () => {
            const whereOrder = {};
            if (query.fromDate || query.toDate)
                whereOrder.createdAt = {};
            if (query.fromDate)
                whereOrder.createdAt.gte = new Date(query.fromDate);
            if (query.toDate)
                whereOrder.createdAt.lte = new Date(query.toDate);
            whereOrder.status = { in: ['PENDING', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED'] };
            const agg = await this.prisma.orderItem.groupBy({
                by: ['productId'],
                _sum: { qty: true },
                where: { order: whereOrder },
                orderBy: { _sum: { qty: query.sort ?? 'desc' } },
                skip: (currentPage - 1) * take,
                take,
            });
            if (!agg.length)
                return [];
            const ids = agg.map((a) => a.productId);
            const products = await this.prisma.product.findMany({
                where: { id: { in: ids }, deletedAt: null, status: client_1.ProductStatus.ACTIVE },
                include: { category: { select: categorySelect } },
            });
            const productMap = new Map(products.map((p) => [p.id, p]));
            const ordered = agg
                .map((entry) => {
                const product = productMap.get(entry.productId);
                return product ? product : null;
            })
                .filter((p) => !!p);
            return Promise.all(ordered.map((product) => this.toProductSummary(product, lang)));
        }, this.homeTtl + this.swrTtl);
    }
    async hotOffers(query = new public_product_query_dto_1.PublicProductFeedDto()) {
        const currentPage = query.page ?? 1;
        const take = query.pageSize ?? 10;
        const lang = query.lang;
        const cacheKey = this.cache.buildKey('home:hot', lang ?? 'en', currentPage, take);
        return this.cache.wrap(cacheKey, async () => {
            const items = await this.prisma.product.findMany({
                where: { isHotOffer: true, status: client_1.ProductStatus.ACTIVE, deletedAt: null },
                include: { category: { select: categorySelect } },
                orderBy: { updatedAt: 'desc' },
                skip: (currentPage - 1) * take,
                take,
            });
            return Promise.all(items.map((product) => this.toProductSummary(product, lang)));
        }, this.homeTtl + this.swrTtl);
    }
    toCents(amount) {
        const numeric = Number(amount);
        if (!Number.isFinite(numeric))
            return undefined;
        return Math.round(numeric * 100);
    }
    localize(value, valueAr, lang) {
        return (0, localize_util_1.localize)(value ?? '', valueAr ?? undefined, lang);
    }
    async toProductSummary(product, lang) {
        return {
            id: product.id,
            name: this.localize(product.name, product.nameAr, lang) ?? product.name,
            slug: product.slug,
            imageUrl: await (0, image_util_1.toPublicImageUrl)(product.imageUrl),
            etag: this.buildEtag(product),
            priceCents: product.priceCents,
            salePriceCents: product.salePriceCents,
            stock: product.stock,
            category: product.category
                ? {
                    id: product.category.id,
                    name: this.localize(product.category.name, product.category.nameAr, lang) ?? product.category.name,
                    slug: product.category.slug,
                }
                : null,
        };
    }
    async toProductDetail(product, lang) {
        return {
            id: product.id,
            name: this.localize(product.name, product.nameAr, lang) ?? product.name,
            slug: product.slug,
            description: this.localize(product.description ?? '', product.descriptionAr ?? '', lang),
            descriptionAr: product.descriptionAr,
            descriptionEn: product.description,
            imageUrl: await (0, image_util_1.toPublicImageUrl)(product.imageUrl),
            etag: this.buildEtag(product),
            images: product.images,
            priceCents: product.priceCents,
            salePriceCents: product.salePriceCents,
            stock: product.stock,
            status: product.status,
            isHotOffer: product.isHotOffer,
            category: product.category
                ? {
                    id: product.category.id,
                    name: this.localize(product.category.name, product.category.nameAr, lang) ?? product.category.name,
                    slug: product.category.slug,
                }
                : null,
        };
    }
    buildEtag(product) {
        const updated = product.updatedAt ? product.updatedAt.getTime() : Date.now();
        return `${product.id}-${updated}`;
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, cache_service_1.CacheService])
], ProductsService);
//# sourceMappingURL=products.service.js.map