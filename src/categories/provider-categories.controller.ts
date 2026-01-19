import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { CategoryListQueryDto, CategoryProductReorderDto } from '../admin/dto/category.dto';
import { Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { toPublicImageUrl } from '../uploads/image.util';

@ApiTags('Provider/Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/categories', version: ['1'] })
export class ProviderCategoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidationService,
  ) {}

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

  @Patch(':id/products/reorder')
  async reorderCategoryProducts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CategoryProductReorderDto,
  ) {
    const providerId = await this.resolveProviderScope(user);
    const orderedProductIds = Array.from(
      new Set((dto.orderedProductIds ?? []).map((entry) => String(entry).trim()).filter(Boolean)),
    );
    if (!orderedProductIds.length) {
      throw new BadRequestException('orderedProductIds is required');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id, deletedAt: null, OR: [{ providerId }, { providerId: null }] },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Category not found');
      const products = await tx.product.findMany({
        where: { categoryId: id, deletedAt: null, providerId },
        select: { id: true, sortOrder: true },
      });
      const existingIds = new Set(products.map((product) => product.id));
      if (existingIds.size !== orderedProductIds.length) {
        throw new BadRequestException('orderedProductIds must include all category products');
      }
      for (const productId of orderedProductIds) {
        if (!existingIds.has(productId)) {
          throw new BadRequestException('orderedProductIds must include all category products');
        }
      }
      const sortOrderMap = new Map(products.map((product) => [product.id, product.sortOrder]));
      const updates = orderedProductIds
        .map((productId, index) => {
          const current = sortOrderMap.get(productId) ?? 0;
          return current === index ? null : { id: productId, sortOrder: index };
        })
        .filter((entry): entry is { id: string; sortOrder: number } => !!entry);
      if (!updates.length) {
        return { updated: 0 };
      }
      const ids = updates.map((entry) => entry.id);
      const cases = Prisma.sql`CASE "id" ${Prisma.join(
        updates.map((entry) => Prisma.sql`WHEN ${entry.id} THEN ${entry.sortOrder}`),
      )} END`;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Product"
        SET "sortOrder" = ${cases}
        WHERE "id" IN (${Prisma.join(ids)})
      `);
      return { updated: updates.length };
    });
    await this.cache.productsChanged();
    return { ok: true, ...result };
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
