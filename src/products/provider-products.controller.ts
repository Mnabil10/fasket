import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags, ApiBody, ApiPropertyOptional } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { Prisma, ProviderStatus, UserRole, ProductPricingModel } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { CreateProductDto, ProductListRequestDto, UpdateProductDto } from '../admin/dto/product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { toPublicImageUrl } from '../uploads/image.util';
import { SlugService } from '../common/slug/slug.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { RequestContextService } from '../common/context/request-context.service';
import { disableWeightOptionGroup, syncWeightOptionGroup } from './weight-variants.util';

class ProviderProductListRequestDto extends ProductListRequestDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  isHotOffer?: boolean;
}

@ApiTags('Provider/Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/products', version: ['1'] })
export class ProviderProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly slugs: SlugService,
    private readonly audit: AuditLogService,
    private readonly cache: CacheInvalidationService,
    private readonly context: RequestContextService,
  ) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT','ACTIVE','HIDDEN','DISCONTINUED'] })
  @ApiQuery({ name: 'minPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'inStock', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'isHotOffer', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['createdAt','priceCents','name','sortOrder'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['asc','desc'] })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: ProviderProductListRequestDto) {
    const providerId = await this.resolveProviderScope(user);
    const where: any = { deletedAt: null, providerId };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (query.isHotOffer !== undefined) where.isHotOffer = query.isHotOffer;
    if (query.minPriceCents !== undefined || query.maxPriceCents !== undefined) {
      where.priceCents = {};
      if (query.minPriceCents !== undefined) where.priceCents.gte = query.minPriceCents;
      if (query.maxPriceCents !== undefined) where.priceCents.lte = query.maxPriceCents;
    }
    if (query.inStock !== undefined) where.stock = query.inStock ? { gt: 0 } : 0;

    const orderBy = query.orderBy ?? 'createdAt';
    const sort = query.sort ?? 'desc';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { [orderBy]: sort },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.product.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (p: any) => ({
      ...p,
      imageUrl: await toPublicImageUrl(p.imageUrl),
    })));
    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerId = await this.resolveProviderScope(user);
    const product = await this.prisma.product.findFirst({
      where: { id, providerId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { ...product, imageUrl: await toPublicImageUrl(product.imageUrl) };
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        priceCents: { type: 'integer' },
        salePriceCents: { type: 'integer' },
        stock: { type: 'integer' },
        status: { type: 'string', enum: ['DRAFT','ACTIVE','HIDDEN','DISCONTINUED'] },
        categoryId: { type: 'string' },
        image: { type: 'string', format: 'binary' },
        sku: { type: 'string' },
        pricingModel: { type: 'string', enum: ['unit', 'weight'] },
        pricePerKg: { type: 'integer' },
        unitLabel: { type: 'string' },
        sortOrder: { type: 'integer' },
      },
      required: ['name','priceCents','stock'],
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
    @Body() dto: CreateProductDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
        new FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    const providerId = await this.resolveProviderScope(user);
    const payload = await this.prepareProductPayload(dto);
    this.normalizeWeightPricing(payload);
    payload.providerId = providerId;
    this.validatePricing(payload);

    if (payload.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: payload.categoryId, OR: [{ providerId }, { providerId: null }] },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }
    if (file) {
      const image = await this.uploads.processProductImage(file);
      payload.imageUrl = image.url;
      payload.images = this.normalizeImagesInput(image.variants) ?? [];
    }
    const created = await this.prisma.product.create({ data: payload as Prisma.ProductCreateInput });
    if (payload.pricingModel === ProductPricingModel.weight) {
      await syncWeightOptionGroup(this.prisma, created.id, payload.pricePerKg ?? payload.priceCents);
    }
    await this.ensureDefaultBranchProduct(created);
    await this.audit.log({
      action: 'product.create',
      entity: 'Product',
      entityId: created.id,
      after: created,
      actorId: user.userId,
    });
    await this.cache.productsChanged();
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
        description: { type: 'string' },
        priceCents: { type: 'integer' },
        salePriceCents: { type: 'integer' },
        stock: { type: 'integer' },
        status: { type: 'string', enum: ['DRAFT','ACTIVE','HIDDEN','DISCONTINUED'] },
        categoryId: { type: 'string' },
        sku: { type: 'string' },
        image: { type: 'string', format: 'binary' },
        pricingModel: { type: 'string', enum: ['unit', 'weight'] },
        pricePerKg: { type: 'integer' },
        unitLabel: { type: 'string' },
        sortOrder: { type: 'integer' },
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
    @Body() dto: UpdateProductDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
        new FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    const providerId = await this.resolveProviderScope(user);
    const existing = await this.prisma.product.findFirst({
      where: { id, providerId },
    });
    if (!existing) throw new NotFoundException('Product not found');
    const payload = await this.prepareProductPayload(dto, id);
    this.normalizeWeightPricing(payload, existing);
    payload.providerId = providerId;
    this.validatePricing(payload, existing);

    if (payload.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: payload.categoryId, OR: [{ providerId }, { providerId: null }] },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }
    if (file) {
      const previousImages = [existing.imageUrl, ...(existing.images ?? [])].filter(
        (url): url is string => !!url,
      );
      const image = await this.uploads.processProductImage(file, previousImages);
      payload.imageUrl = image.url;
      payload.images = this.normalizeImagesInput(image.variants) ?? [];
    }
    const updateData: Prisma.ProductUpdateInput = { ...payload };
    if (Array.isArray(payload.images)) {
      updateData.images = { set: payload.images };
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: updateData,
    });
    const nextPricingModel = (payload.pricingModel ?? existing.pricingModel) as ProductPricingModel;
    if (nextPricingModel === ProductPricingModel.weight) {
      const pricePerKg = payload.pricePerKg ?? existing.pricePerKg ?? updated.priceCents;
      await syncWeightOptionGroup(this.prisma, updated.id, pricePerKg);
    } else if (existing.pricingModel === ProductPricingModel.weight && payload.pricingModel === ProductPricingModel.unit) {
      await disableWeightOptionGroup(this.prisma, updated.id);
    }
    await this.ensureDefaultBranchProduct(updated);
    if (payload.stock !== undefined && payload.stock !== existing.stock) {
      await this.recordStockChange(id, existing.stock, payload.stock, 'provider.update');
    }
    await this.audit.log({
      action: 'product.update',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: updated,
      actorId: user.userId,
    });
    await this.cache.productsChanged();
    return updated;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerId = await this.resolveProviderScope(user);
    const existing = await this.prisma.product.findFirst({ where: { id, providerId } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      action: 'product.delete',
      entity: 'Product',
      entityId: id,
      before: existing,
      actorId: user.userId,
    });
    await this.cache.productsChanged();
    return { ok: true };
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { status: true } } },
    });
    if (!membership) {
      throw new BadRequestException('Provider account is not linked');
    }
    if (membership.provider.status !== ProviderStatus.ACTIVE) {
      throw new BadRequestException('Provider account is not active');
    }
    return membership.providerId;
  }

  private validatePricing(
    payload: Record<string, any>,
    existing?: { priceCents: number; salePriceCents?: number | null; pricingModel?: string | null; pricePerKg?: number | null },
  ) {
    const price = payload.priceCents ?? existing?.priceCents;
    const sale = payload.salePriceCents ?? existing?.salePriceCents ?? null;
    const pricingModel = payload.pricingModel ?? existing?.pricingModel ?? ProductPricingModel.unit;
    const pricePerKg = payload.pricePerKg ?? existing?.pricePerKg ?? null;
    if (price !== undefined && price < 0) {
      throw new BadRequestException('Invalid price');
    }
    if (sale !== null && sale !== undefined && price !== undefined && sale >= price) {
      throw new BadRequestException('Sale price must be lower than price');
    }
    if (pricingModel === ProductPricingModel.weight) {
      if (pricePerKg === null || pricePerKg === undefined) {
        throw new BadRequestException('Price per kg is required for weight-based products');
      }
      if (pricePerKg < 0) {
        throw new BadRequestException('Invalid price per kg');
      }
    }
    if (payload.stock !== undefined && payload.stock < 0) {
      throw new BadRequestException('Invalid stock');
    }
  }

  private normalizeWeightPricing(
    payload: Record<string, any>,
    existing?: { pricingModel?: string | null; pricePerKg?: number | null; unitLabel?: string | null; priceCents: number },
  ) {
    const pricingModel = payload.pricingModel ?? existing?.pricingModel ?? ProductPricingModel.unit;
    if (pricingModel === ProductPricingModel.weight) {
      const pricePerKg =
        payload.pricePerKg ??
        existing?.pricePerKg ??
        payload.priceCents ??
        existing?.priceCents;
      if (pricePerKg !== undefined && pricePerKg !== null) {
        payload.pricePerKg = pricePerKg;
      }
      if (payload.priceCents === undefined && pricePerKg !== undefined && pricePerKg !== null) {
        payload.priceCents = pricePerKg;
      }
      if (!payload.unitLabel) {
        payload.unitLabel = existing?.unitLabel ?? 'kg';
      }
      payload.salePriceCents = null;
      payload.pricingModel = ProductPricingModel.weight;
    } else if (payload.pricingModel === ProductPricingModel.unit) {
      payload.pricingModel = ProductPricingModel.unit;
      payload.pricePerKg = null;
      payload.unitLabel = null;
    }
  }

  private async prepareProductPayload(dto: CreateProductDto | UpdateProductDto, id?: string) {
    const data: Record<string, any> = { ...dto };
    if (data.name) data.name = data.name.trim();
    if (data.description) data.description = data.description.trim();
    if (!data.slug && data.name) data.slug = data.name;
    if (data.slug) {
      data.slug = await this.slugs.generateUniqueSlug('product', data.slug, id);
    }
    if (!data.sku && data.name) {
      data.sku = await this.generateSku(data.name, id);
    } else if (data.sku) {
      data.sku = data.sku.toUpperCase();
    }
    if (data.images !== undefined) {
      const normalizedImages = this.normalizeImagesInput(data.images);
      if (normalizedImages !== undefined) {
        data.images = normalizedImages;
      } else {
        delete data.images;
      }
    }
    return data;
  }

  private normalizeImagesInput(value: unknown): string[] | undefined {
    if (value === undefined || value === null) return undefined;
    let raw: unknown = value;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed;
      }
    }
    const entries = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
    const normalized = entries
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const candidate =
            typeof (entry as any).url === 'string'
              ? (entry as any).url
              : typeof (entry as any).value === 'string'
                ? (entry as any).value
                : undefined;
          return candidate?.trim();
        }
        return undefined;
      })
      .filter((entry): entry is string => !!entry);
    return normalized;
  }

  private async generateSku(name?: string, excludeId?: string) {
    const base =
      (name || 'SKU')
        .replace(/[^a-z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 6) || 'SKU';
    let attempt = 0;
    while (attempt < 10) {
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const candidate = `${base}-${suffix}`;
      const exists = await this.prisma.product.findFirst({
        where: {
          sku: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });
      if (!exists) return candidate;
      attempt += 1;
    }
    return `${base}-${Date.now()}`;
  }

  private async recordStockChange(productId: string, previous: number, next: number, reason: string) {
    if (previous === next) return;
    await this.prisma.productStockLog.create({
      data: {
        productId,
        previousStock: previous,
        newStock: next,
        delta: next - previous,
        reason,
        actorId: this.context.get('userId'),
      },
    });
  }

  private async ensureDefaultBranchProduct(product: { id: string; providerId?: string | null }) {
    if (!product?.providerId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { providerId: product.providerId, status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, isDefault: true },
    });
    if (!branch) return;
    await this.prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: {},
      create: { branchId: branch.id, productId: product.id, isActive: true },
    });
  }
}
