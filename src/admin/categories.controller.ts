import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { AdminOnly, ProviderOrStaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { CategoryListQueryDto, CategoryProductReorderDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { UploadsService } from 'src/uploads/uploads.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Admin/Categories')
@ApiBearerAuth()
@ProviderOrStaffOrAdmin()
@Controller({ path: 'admin/categories', version: ['1'] })
export class AdminCategoriesController {
  constructor(private svc: AdminService, private uploads: UploadsService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'isActive', required: false, schema: { type: 'boolean' } })
  @ApiOkResponse({ description: 'Paginated categories' })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: CategoryListQueryDto) {
    const providerScope = await this.resolveProviderScope(user);
    const where: any = {};
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    if (query.parentId) where.parentId = query.parentId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (providerScope) {
      where.providerId = providerScope;
    } else if (query.providerId) {
      where.providerId = query.providerId;
    }
    // deletedAt is soft-delete flag
    where.deletedAt = null;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.category.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (c: any) => ({
      ...c,
      imageUrl: await toPublicImageUrl(c.imageUrl),
    })));
    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerScope = await this.resolveProviderScope(user);
    const c = await this.svc.prisma.category.findFirst({
      where: { id, ...(providerScope ? { providerId: providerScope } : {}) },
    });
    if (!c) {
      throw new NotFoundException('Category not found');
    }
    return { ...c, imageUrl: await toPublicImageUrl((c as any).imageUrl) } as any;
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        isActive: { type: 'boolean' },
        sortOrder: { type: 'integer' },
        parentId: { type: 'string' },
        image: { type: 'string', format: 'binary' },
      },
      required: ['name'],
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
      const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
        .split(',').map(s => s.trim());
      if (file && !allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported content type') as any, false);
      cb(null, true);
    },
  }))
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCategoryDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
        new FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const payload = await this.prepareCategoryPayload(dto);
    if (providerScope) {
      payload.providerId = providerScope;
      if (payload.parentId) {
        const parent = await this.svc.prisma.category.findFirst({
          where: { id: payload.parentId, providerId: providerScope },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('Parent category not found');
        }
      }
    } else if (payload.providerId && payload.parentId) {
      const parent = await this.svc.prisma.category.findFirst({
        where: { id: payload.parentId, providerId: payload.providerId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }
    }
    if (file) {
      const uploaded = await this.uploads.processImageAsset(file, { folder: 'categories', generateVariants: false });
      payload.imageUrl = uploaded.url;
    }
    const created = await this.svc.prisma.category.create({ data: payload as Prisma.CategoryCreateInput });
    await this.svc.audit.log({
      action: 'category.create',
      entity: 'Category',
      entityId: created.id,
      after: created,
    });
    await this.svc.cache.categoriesChanged();
    return created;
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        isActive: { type: 'boolean' },
        sortOrder: { type: 'integer' },
        parentId: { type: 'string' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
      const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
        .split(',').map(s => s.trim());
      if (file && !allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported content type') as any, false);
      cb(null, true);
    },
  }))
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
        new FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const existing = await this.svc.prisma.category.findFirst({
      where: { id, ...(providerScope ? { providerId: providerScope } : {}) },
    });
    if (!existing) throw new NotFoundException('Category not found');
    const payload = await this.prepareCategoryPayload(dto, id);
    if (providerScope) {
      payload.providerId = providerScope;
      if (payload.parentId) {
        const parent = await this.svc.prisma.category.findFirst({
          where: { id: payload.parentId, providerId: providerScope },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('Parent category not found');
        }
      }
    } else if (payload.providerId && payload.parentId) {
      const parent = await this.svc.prisma.category.findFirst({
        where: { id: payload.parentId, providerId: payload.providerId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }
    }
    if (file) {
      const uploaded = await this.uploads.processImageAsset(file, {
        folder: 'categories',
        generateVariants: false,
        existing: existing.imageUrl ? [existing.imageUrl] : [],
      });
      payload.imageUrl = uploaded.url;
    }
    const updated = await this.svc.prisma.category.update({
      where: { id },
      data: payload as Prisma.CategoryUpdateInput,
    });
    await this.svc.audit.log({
      action: 'category.update',
      entity: 'Category',
      entityId: id,
      before: existing,
      after: updated,
    });
    await this.svc.cache.categoriesChanged();
    return updated;
  }

  @Patch(':id/products/reorder')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderedProductIds'],
      properties: { orderedProductIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  async reorderCategoryProducts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CategoryProductReorderDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const orderedProductIds = Array.from(
      new Set((dto.orderedProductIds ?? []).map((entry) => String(entry).trim()).filter(Boolean)),
    );
    if (!orderedProductIds.length) {
      throw new BadRequestException('orderedProductIds is required');
    }
    const categoryWhere: Prisma.CategoryWhereInput = {
      id,
      deletedAt: null,
      ...(providerScope ? { OR: [{ providerId: providerScope }, { providerId: null }] } : {}),
    };
    const result = await this.svc.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: categoryWhere, select: { id: true } });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      const products = await tx.product.findMany({
        where: {
          categoryId: id,
          deletedAt: null,
          ...(providerScope ? { providerId: providerScope } : {}),
        },
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
    await this.svc.cache.productsChanged();
    return { ok: true, ...result };
  }

  // Soft delete: sets deletedAt, keeps referential integrity
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id') id: string) {
    const existing = await this.svc.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    await this.svc.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.svc.audit.log({
      action: 'category.delete',
      entity: 'Category',
      entityId: id,
      before: existing,
    });
    await this.svc.cache.categoriesChanged();
    return { ok: true };
  }

  private async prepareCategoryPayload(dto: CreateCategoryDto | UpdateCategoryDto, id?: string) {
    const data: Record<string, any> = { ...dto };
    if (data.name) data.name = data.name.trim();
    if (!data.slug && data.name) data.slug = data.name;
    if (data.slug) {
      data.slug = await this.svc.slugs.generateUniqueSlug('category', data.slug, id);
    }
    return data;
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.svc.prisma.providerUser.findFirst({
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
