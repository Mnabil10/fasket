import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { BranchStatus, Prisma, ProviderStatus } from '@prisma/client';
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

    const providerIds = items.map((provider) => provider.id);
    const branches = providerIds.length
      ? await this.prisma.branch.findMany({
          where: { providerId: { in: providerIds }, status: BranchStatus.ACTIVE },
          select: { id: true, providerId: true, schedulingEnabled: true, schedulingAllowAsap: true },
        })
      : [];
    const windows = providerIds.length
      ? await this.prisma.deliveryWindow.findMany({
          where: { providerId: { in: providerIds }, isActive: true },
          select: { providerId: true, id: true },
        })
      : [];
    const windowsByProvider = new Map<string, number>();
    windows.forEach((window) => {
      windowsByProvider.set(window.providerId, (windowsByProvider.get(window.providerId) ?? 0) + 1);
    });
    const branchesByProvider = new Map<string, typeof branches>();
    branches.forEach((branch) => {
      const list = branchesByProvider.get(branch.providerId) ?? [];
      list.push(branch);
      branchesByProvider.set(branch.providerId, list);
    });

    const mapped = await Promise.all(
      items.map(async (provider) => {
        const providerBranches = branchesByProvider.get(provider.id) ?? [];
        const hasWindows = (windowsByProvider.get(provider.id) ?? 0) > 0;
        const supportsPreorder = providerBranches.some((branch) => branch.schedulingEnabled) && hasWindows;
        const supportsInstant = providerBranches.some(
          (branch) => !branch.schedulingEnabled || branch.schedulingAllowAsap,
        );
        return {
          id: provider.id,
          name: localize(provider.name, provider.nameAr ?? undefined, lang),
          nameAr: provider.nameAr ?? null,
          slug: provider.slug,
          type: provider.type,
          ratingAvg: provider.ratingAvg ?? 0,
          ratingCount: provider.ratingCount ?? 0,
          logoUrl: await toPublicImageUrl(provider.logoUrl),
          supportsInstant,
          supportsPreorder,
          nextSlot: null,
        };
      }),
    );

    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }
}
