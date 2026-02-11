import { Injectable, Logger } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { CacheService } from '../common/cache/cache.service';
import { localize } from '../common/utils/localize.util';
import { PublicCategoryListDto } from './dto/public-category-query.dto';
import { normalizeTtlSeconds } from '../common/utils/ttl.util';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);
  private readonly ttl = normalizeTtlSeconds(
    'CATEGORIES_CACHE_TTL',
    Number(process.env.CATEGORIES_CACHE_TTL ?? 60),
    60 * 60 * 6,
    60,
    this.logger.warn.bind(this.logger),
  );

  constructor(private prisma: PrismaService, private cache: CacheService) {}

  async listActive(query: PublicCategoryListDto) {
    const sort = query.sort ?? 'asc';
    const lang = query.lang ?? 'en';
    const cacheKey = this.cache.buildKey(
      'categories:active',
      lang,
      query.q ?? '',
      query.providerId ?? '',
      query.page,
      query.pageSize,
      sort,
    );
    return this.cache.wrap(
      cacheKey,
      async () => {
        const where: any = { isActive: true, deletedAt: null };
        if (query.q) {
          where.OR = [
            { name: { contains: query.q, mode: 'insensitive' } },
            { slug: { contains: query.q, mode: 'insensitive' } },
          ];
        }
        if (query.providerId) {
          where.products = {
            some: {
              providerId: query.providerId,
              status: ProductStatus.ACTIVE,
              deletedAt: null,
            },
          };
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
        const mapped = await Promise.all(
          items.map(async (c) => ({
            ...c,
            name: localize(c.name, c.nameAr, lang),
            imageUrl: await toPublicImageUrl(c.imageUrl),
          })),
        );
        return { items: mapped, total, page: query.page, pageSize: query.pageSize };
      },
      this.ttl,
    );
  }
}
