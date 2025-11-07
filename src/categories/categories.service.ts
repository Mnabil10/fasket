import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toBase64DataUrl } from 'src/uploads/image.util';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async listActive(lang?: 'en'|'ar') {
    const items = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, nameAr: true, slug: true, imageUrl: true, parentId: true },
    });
    return Promise.all(items.map(async c => ({
      ...c,
      name: lang === 'ar' && c.nameAr ? c.nameAr : c.name,
      imageUrl: await toBase64DataUrl(c.imageUrl),
    })));
  }
}
