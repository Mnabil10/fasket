import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryListQueryDto } from '../admin/dto/category.dto';
import { ProviderStatus, UserRole } from '@prisma/client';
import { toPublicImageUrl } from '../uploads/image.util';

@ApiTags('Provider/Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/categories', version: ['1'] })
export class ProviderCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'isActive', required: false, schema: { type: 'boolean' } })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: CategoryListQueryDto) {
    const providerId = await this.resolveProviderScope(user);
    const where: any = { deletedAt: null };
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    if (query.parentId) where.parentId = query.parentId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    where.OR = [{ providerId }, { providerId: null }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.category.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (c: any) => ({
      ...c,
      imageUrl: await toPublicImageUrl(c.imageUrl),
    })));
    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { status: true } } },
    });
    if (!membership) {
      throw new ForbiddenException('Provider account is not linked');
    }
    if (membership.provider.status !== ProviderStatus.ACTIVE) {
      throw new ForbiddenException('Provider account is not active');
    }
    return membership.providerId;
  }
}
