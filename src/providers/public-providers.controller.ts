import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { localize } from 'src/common/utils/localize.util';
import { PublicProviderListDto } from './dto/public-provider-query.dto';

@ApiTags('Providers')
@Controller({ path: 'providers', version: ['1', '2'] })
export class PublicProvidersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'type', required: false })
  async list(@Query() query: PublicProviderListDto) {
    const lang = query.lang ?? 'en';
    const where: Prisma.ProviderWhereInput = { status: ProviderStatus.ACTIVE };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { nameAr: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.type) {
      where.type = query.type as any;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.provider.count({ where }),
    ]);

    const mapped = await Promise.all(
      items.map(async (provider) => ({
        id: provider.id,
        name: localize(provider.name, provider.nameAr ?? undefined, lang),
        nameAr: provider.nameAr ?? null,
        slug: provider.slug,
        type: provider.type,
        ratingAvg: provider.ratingAvg ?? 0,
        ratingCount: provider.ratingCount ?? 0,
        logoUrl: await toPublicImageUrl(provider.logoUrl),
      }))
    );

    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }
}
