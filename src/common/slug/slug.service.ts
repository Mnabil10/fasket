import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainError, ErrorCode } from '../errors';
import { slugify } from '../utils/slug.util';

type SupportedModels = 'product' | 'category' | 'provider' | 'branch';

@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  async generateUniqueSlug(model: SupportedModels, base: string, excludeId?: string) {
    let slug = slugify(base);
    if (!slug) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Name or slug is required');
    }
    let counter = 1;
    while (await this.exists(model, slug, excludeId)) {
      slug = `${slugify(base)}-${counter++}`;
    }
    return slug;
  }

  private async exists(model: SupportedModels, slug: string, excludeId?: string) {
    const where: any = { slug };
    if (excludeId) {
      where.NOT = { id: excludeId };
    }
    const entity = await (this.prisma as any)[model].findFirst({ where });
    return !!entity;
  }
}
