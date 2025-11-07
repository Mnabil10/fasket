import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toBase64DataUrl } from 'src/uploads/image.util';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async list(q: { q?: string; categoryId?: string; min?: number; max?: number; status?: string; lang?: 'en'|'ar' }) {
    const where: any = { deletedAt: null };
    if (q?.status) where.status = q.status as any;
    if (q?.categoryId) where.categoryId = q.categoryId;
    if (q?.q) where.OR = [
      { name: { contains: q.q, mode: 'insensitive' } },
      { slug: { contains: q.q, mode: 'insensitive' } },
    ];
    if (q?.min || q?.max) {
      where.priceCents = {};
      if (q.min) where.priceCents.gte = q.min;
      if (q.max) where.priceCents.lte = q.max;
    }
    const items = await this.prisma.product.findMany({
      where,
      select: {
        id: true, name: true, nameAr: true, slug: true, imageUrl: true,
        priceCents: true, salePriceCents: true, stock: true, status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(items.map(async p => ({
      ...p,
      name: q.lang === 'ar' && p.nameAr ? p.nameAr : p.name,
      imageUrl: await toBase64DataUrl(p.imageUrl),
    })));
  }

  async one(idOrSlug: string, lang?: 'en'|'ar') {
    const p = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      include: { category: { select: { id: true, name: true, nameAr: true, slug: true } } },
    });
    if (!p) return p;
    const name = lang === 'ar' && (p as any).nameAr ? (p as any).nameAr : p.name;
    const categoryName = p.category ? (lang === 'ar' && (p.category as any).nameAr ? (p.category as any).nameAr : p.category.name) : undefined;
    return { ...p, name, category: p.category ? { ...p.category, name: categoryName } : null, imageUrl: await toBase64DataUrl((p as any).imageUrl) } as any;
  }

  async bestSelling(limit = 10, lang?: 'en'|'ar') {
    const agg = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: limit,
    });
    const ids = agg.map(a => a.productId);
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' as any },
      select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, priceCents: true, salePriceCents: true },
    });
    const byId = new Map(products.map(p => [p.id, p] as const));
    const mapped = await Promise.all(agg.map(async a => {
      const p = byId.get(a.productId);
      if (!p) return null;
      const name = lang === 'ar' && p.nameAr ? p.nameAr : p.name;
      return { ...p, name, totalSold: a._sum.qty ?? 0, imageUrl: await toBase64DataUrl(p.imageUrl) };
    }));
    return mapped.filter(Boolean);
  }

  async hotOffers(limit = 10, lang?: 'en'|'ar') {
    const items = await this.prisma.product.findMany({
      where: { isHotOffer: true, status: 'ACTIVE' as any, deletedAt: null },
      select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, priceCents: true, salePriceCents: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return Promise.all(items.map(async p => ({ ...p, name: lang === 'ar' && p.nameAr ? p.nameAr : p.name, imageUrl: await toBase64DataUrl(p.imageUrl) })));
  }
}
