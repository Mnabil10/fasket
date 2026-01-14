import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { PublicProductFeedDto, PublicProductListDto } from './dto/public-product-query.dto';
import { CacheService } from '../common/cache/cache.service';
import { localize } from '../common/utils/localize.util';

type Lang = 'en' | 'ar' | undefined;
const categorySelect = {
  id: true,
  name: true,
  nameAr: true,
  slug: true,
} as const;
type ProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: { select: typeof categorySelect } };
}>;
type ProductDetailWithOptions = Prisma.ProductGetPayload<{
  include: {
    category: { select: typeof categorySelect };
    optionGroups: { include: { options: true } };
  };
}>;

@Injectable()
export class ProductsService {
  private readonly listTtl = Number(process.env.PRODUCT_LIST_CACHE_TTL ?? 60);
  private readonly homeTtl = Number(process.env.HOME_CACHE_TTL ?? 120);
  private readonly swrTtl = Number(process.env.CACHE_SWR_TTL ?? 30);

  constructor(private prisma: PrismaService, private cache: CacheService) {}

  async list(q: PublicProductListDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const cacheKey = this.cache.buildKey(
      'products:list',
      q.lang ?? 'en',
      q.q ?? '',
      q.categoryId ?? '',
      q.categorySlug ?? '',
      q.providerId ?? '',
      q.min ?? '',
      q.max ?? '',
      q.orderBy ?? '',
      q.sort ?? '',
      page,
      pageSize,
    );

    return this.cache.wrap(cacheKey, async () => {
      const where: Prisma.ProductWhereInput = {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      };
      if (q?.categoryId) where.categoryId = q.categoryId;
      if (q?.providerId) where.providerId = q.providerId;
      if (q?.categorySlug) {
        const category = await this.prisma.category.findFirst({
          where: { slug: q.categorySlug, deletedAt: null },
          select: { id: true },
        });
        if (category) where.categoryId = category.id;
      }
      const search = q?.q?.trim();
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { nameAr: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { descriptionAr: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (q?.min !== undefined || q?.max !== undefined) {
        const range: Prisma.IntFilter = {};
        const minCents = q.min !== undefined ? this.toCents(q.min) : undefined;
        const maxCents = q.max !== undefined ? this.toCents(q.max) : undefined;
        if (minCents !== undefined) range.gte = minCents;
        if (maxCents !== undefined) range.lte = maxCents;
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

  async one(idOrSlug: string, lang?: Lang) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      },
      include: {
        category: { select: categorySelect },
        optionGroups: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!product) return null;
    return this.toProductDetail(product, lang);
  }

  async bestSelling(query: PublicProductFeedDto = new PublicProductFeedDto()) {
    const currentPage = query.page ?? 1;
    const take = query.pageSize ?? 10;
    const lang = query.lang;
    const cacheKey = this.cache.buildKey(
      'home:best',
      lang ?? 'en',
      query.providerId ?? '',
      currentPage,
      take,
      query.fromDate ?? '',
      query.toDate ?? '',
      query.orderBy ?? 'qty',
      query.sort ?? 'desc',
    );
    return this.cache.wrap(cacheKey, async () => {
      const whereOrder: Prisma.OrderWhereInput = {};
      if (query.fromDate || query.toDate) whereOrder.createdAt = {};
      if (query.fromDate) (whereOrder.createdAt as Prisma.DateTimeFilter).gte = new Date(query.fromDate);
      if (query.toDate) (whereOrder.createdAt as Prisma.DateTimeFilter).lte = new Date(query.toDate);
      whereOrder.status = { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] as any };

      const whereOrderItem: Prisma.OrderItemWhereInput = { order: whereOrder };
      if (query.providerId) {
        whereOrderItem.product = { providerId: query.providerId };
      }

      const agg = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { qty: true },
        where: whereOrderItem,
        orderBy: { _sum: { qty: query.sort ?? 'desc' } },
        skip: (currentPage - 1) * take,
        take,
      });
      if (!agg.length) return [];
      const ids = agg.map((a) => a.productId);
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          status: ProductStatus.ACTIVE,
          ...(query.providerId ? { providerId: query.providerId } : {}),
        },
        include: { category: { select: categorySelect } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const ordered = agg
        .map((entry) => {
          const product = productMap.get(entry.productId);
          return product ? product : null;
        })
        .filter((p): p is typeof products[number] => !!p);
      return Promise.all(ordered.map((product) => this.toProductSummary(product, lang)));
    }, this.homeTtl + this.swrTtl);
  }

  async hotOffers(query: PublicProductFeedDto = new PublicProductFeedDto()) {
    const currentPage = query.page ?? 1;
    const take = query.pageSize ?? 10;
    const lang = query.lang;
    const cacheKey = this.cache.buildKey('home:hot', lang ?? 'en', query.providerId ?? '', currentPage, take);
    return this.cache.wrap(cacheKey, async () => {
      const items = await this.prisma.product.findMany({
        where: {
          isHotOffer: true,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          ...(query.providerId ? { providerId: query.providerId } : {}),
        },
        include: { category: { select: categorySelect } },
        orderBy: { updatedAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
      });
      return Promise.all(items.map((product) => this.toProductSummary(product, lang)));
    }, this.homeTtl + this.swrTtl);
  }

  private toCents(amount: number) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.round(numeric * 100);
  }

  private localize(value: string | null, valueAr: string | null, lang?: Lang) {
    return localize(value ?? '', valueAr ?? undefined, lang);
  }

  private async toProductSummary(product: ProductWithCategory, lang?: Lang) {
    return {
      id: product.id,
      name: this.localize(product.name, product.nameAr, lang) ?? product.name,
      slug: product.slug,
      imageUrl: await toPublicImageUrl(product.imageUrl),
      etag: this.buildEtag(product),
      priceCents: product.priceCents,
      salePriceCents: product.salePriceCents,
      stock: product.stock,
      providerId: product.providerId,
      category: product.category
        ? {
            id: product.category.id,
            name: this.localize(product.category.name, product.category.nameAr, lang) ?? product.category.name,
            slug: product.category.slug,
          }
        : null,
    };
  }

  private async toProductDetail(product: ProductDetailWithOptions, lang?: Lang) {
    return {
      id: product.id,
      name: this.localize(product.name, product.nameAr, lang) ?? product.name,
      slug: product.slug,
      description: this.localize(product.description ?? '', product.descriptionAr ?? '', lang),
      descriptionAr: product.descriptionAr,
      descriptionEn: product.description,
      imageUrl: await toPublicImageUrl(product.imageUrl),
      etag: this.buildEtag(product),
      images: product.images,
      priceCents: product.priceCents,
      salePriceCents: product.salePriceCents,
      stock: product.stock,
      status: product.status,
      isHotOffer: product.isHotOffer,
      providerId: product.providerId,
      category: product.category
        ? {
            id: product.category.id,
            name: this.localize(product.category.name, product.category.nameAr, lang) ?? product.category.name,
            slug: product.category.slug,
          }
        : null,
      optionGroups: (product.optionGroups ?? []).map((group) => ({
        id: group.id,
        name: this.localize(group.name, group.nameAr, lang) ?? group.name,
        nameAr: group.nameAr,
        type: group.type,
        priceMode: group.priceMode,
        minSelected: group.minSelected,
        maxSelected: group.maxSelected,
        sortOrder: group.sortOrder,
        isActive: group.isActive,
        options: (group.options ?? []).map((option) => ({
          id: option.id,
          name: this.localize(option.name, option.nameAr, lang) ?? option.name,
          nameAr: option.nameAr,
          priceCents: option.priceCents,
          maxQtyPerOption: option.maxQtyPerOption,
          sortOrder: option.sortOrder,
          isActive: option.isActive,
        })),
      })),
    };
  }

  private buildEtag(product: { id: string; updatedAt?: Date }) {
    const updated = product.updatedAt ? product.updatedAt.getTime() : Date.now();
    return `${product.id}-${updated}`;
  }
}
