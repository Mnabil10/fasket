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
  StreamableFile,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { Prisma, ProviderStatus, UserRole, ProductPricingModel } from '@prisma/client';
import { AdminOnly, ProviderOrStaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { BulkUploadResult, ProductsBulkService } from './products-bulk.service';
import { CreateProductDto, ProductListRequestDto, UpdateProductDto } from './dto/product.dto';
import { UploadsService } from 'src/uploads/uploads.service';
import { toPublicImageUrl } from 'src/uploads/image.util';
import { RequestContextService } from '../common/context/request-context.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { disableWeightOptionGroup, syncWeightOptionGroup } from '../products/weight-variants.util';

@ApiTags('Admin/Products')
@ApiBearerAuth()
@ProviderOrStaffOrAdmin()
@Controller({ path: 'admin/products', version: ['1'] })
export class AdminProductsController {
  private readonly logger = new Logger(AdminProductsController.name);

  constructor(
    private svc: AdminService,
    private uploads: UploadsService,
    private bulkService: ProductsBulkService,
    private readonly context: RequestContextService,
  ) {}

  @Get('bulk-template')
  @ApiOkResponse({
    description: 'Excel template containing the required header row',
    schema: { type: 'string', format: 'binary' },
  })
  downloadBulkTemplate() {
    const buffer = this.bulkService.generateTemplate();
    return new StreamableFile(buffer, {
      disposition: 'attachment; filename="products-bulk-template.xlsx"',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  @Post('bulk-upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Summary of created, updated, and failed rows',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'integer' },
        updated: { type: 'integer' },
        skipped: { type: 'integer' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              row: { type: 'integer' },
              message: { type: 'string' },
            },
          },
        },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rowNumber: { type: 'integer' },
              status: { type: 'string', enum: ['created', 'updated', 'skipped', 'error'] },
              errorMessage: { type: 'string' },
              productId: { type: 'string' },
              dryRun: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async bulkUpload(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024, message: 'File must not exceed 5MB' }),
          new FileTypeValidator({ fileType: /(csv|excel|spreadsheetml)/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ): Promise<BulkUploadResult> {
    const providerScope = await this.resolveProviderScope(user);
    return this.bulkService.processUpload(file, {
      dryRun: String(dryRun).toLowerCase() === 'true',
      providerId: providerScope ?? undefined,
    });
  }

  @Get('hot-offers')
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ description: 'Paginated hot offer products' })
  async listHotOffers(@CurrentUser() user: CurrentUserPayload, @Query() query: ProductListRequestDto) {
    const providerScope = await this.resolveProviderScope(user);
    const where: any = { deletedAt: null, isHotOffer: true };
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ];
    if (providerScope) {
      where.providerId = providerScope;
    } else if (query.providerId) {
      where.providerId = query.providerId;
    }
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.product.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (p: any) => ({
      ...p,
      imageUrl: await toPublicImageUrl(p.imageUrl),
    })));
    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT','ACTIVE','HIDDEN','DISCONTINUED'] })
  @ApiQuery({ name: 'minPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'inStock', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['createdAt','priceCents','name','sortOrder'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['asc','desc'] })
  @ApiOkResponse({ description: 'Paginated products' })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: ProductListRequestDto) {
    const providerScope = await this.resolveProviderScope(user);
    const where: any = { deletedAt: null };
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ];
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (providerScope) {
      where.providerId = providerScope;
    } else if (query.providerId) {
      where.providerId = query.providerId;
    }
    if (query.minPriceCents !== undefined || query.maxPriceCents !== undefined) {
      where.priceCents = {};
      if (query.minPriceCents !== undefined) where.priceCents.gte = query.minPriceCents;
      if (query.maxPriceCents !== undefined) where.priceCents.lte = query.maxPriceCents;
    }
    if (query.inStock !== undefined) where.stock = query.inStock ? { gt: 0 } : 0;

    const orderBy = query.orderBy ?? 'createdAt';
    const sort = query.sort ?? 'desc';

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.product.findMany({
        where,
        orderBy: { [orderBy]: sort },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.product.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (p: any) => ({
      ...p,
      imageUrl: await toPublicImageUrl(p.imageUrl),
    })));
    return { items: mapped, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerScope = await this.resolveProviderScope(user);
    const p = await this.svc.prisma.product.findFirst({
      where: { id, ...(providerScope ? { providerId: providerScope } : {}) },
    });
    if (!p) return p as any;
    return { ...p, imageUrl: await toPublicImageUrl((p as any).imageUrl) } as any;
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
    const providerScope = await this.resolveProviderScope(user);
    const payload = await this.prepareProductPayload(dto);
    this.normalizeWeightPricing(payload);
    this.validatePricing(payload);
    if (providerScope) {
      payload.providerId = providerScope;
      if (payload.categoryId) {
        const category = await this.svc.prisma.category.findFirst({
          where: { id: payload.categoryId, providerId: providerScope },
          select: { id: true },
        });
        if (!category) {
          throw new BadRequestException('Category not found');
        }
      }
    } else if (payload.providerId && payload.categoryId) {
      const category = await this.svc.prisma.category.findFirst({
        where: { id: payload.categoryId, providerId: payload.providerId },
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
    const created = await this.svc.prisma.product.create({ data: payload as Prisma.ProductCreateInput });
    if (payload.pricingModel === ProductPricingModel.weight) {
      await syncWeightOptionGroup(this.svc.prisma, created.id, payload.pricePerKg ?? payload.priceCents);
    }
    await this.ensureDefaultBranchProduct(created);
    await this.svc.audit.log({
      action: 'product.create',
      entity: 'Product',
      entityId: created.id,
      after: created,
    });
    this.logger.log({
      msg: 'Product created',
      productId: created.id,
      priceCents: created.priceCents,
      salePriceCents: created.salePriceCents,
      status: created.status,
    });
    await this.svc.cache.productsChanged();
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
    const providerScope = await this.resolveProviderScope(user);
    const existing = await this.svc.prisma.product.findFirst({
      where: { id, ...(providerScope ? { providerId: providerScope } : {}) },
    });
    if (!existing) throw new NotFoundException('Product not found');
    const payload = await this.prepareProductPayload(dto, id);
    this.normalizeWeightPricing(payload, existing);
    this.validatePricing(payload, existing);
    if (providerScope) {
      payload.providerId = providerScope;
      if (payload.categoryId) {
        const category = await this.svc.prisma.category.findFirst({
          where: { id: payload.categoryId, providerId: providerScope },
          select: { id: true },
        });
        if (!category) {
          throw new BadRequestException('Category not found');
        }
      }
    } else if (payload.providerId && payload.categoryId) {
      const category = await this.svc.prisma.category.findFirst({
        where: { id: payload.categoryId, providerId: payload.providerId },
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
    const updated = await this.svc.prisma.product.update({
      where: { id },
      data: updateData,
    });
    const nextPricingModel = (payload.pricingModel ?? existing.pricingModel) as ProductPricingModel;
    if (nextPricingModel === ProductPricingModel.weight) {
      const pricePerKg = payload.pricePerKg ?? existing.pricePerKg ?? updated.priceCents;
      await syncWeightOptionGroup(this.svc.prisma, updated.id, pricePerKg);
    } else if (existing.pricingModel === ProductPricingModel.weight && payload.pricingModel === ProductPricingModel.unit) {
      await disableWeightOptionGroup(this.svc.prisma, updated.id);
    }
    await this.ensureDefaultBranchProduct(updated);
    if (payload.stock !== undefined && payload.stock !== existing.stock) {
      await this.recordStockChange(id, existing.stock, payload.stock, 'admin.update');
    }
    await this.svc.audit.log({
      action: 'product.update',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: updated,
    });
    if (payload.priceCents !== undefined && payload.priceCents !== existing.priceCents) {
      this.logger.log({
        msg: 'Product price changed',
        productId: id,
        from: existing.priceCents,
        to: payload.priceCents,
      });
    }
    if (payload.status && payload.status !== existing.status) {
      this.logger.log({ msg: 'Product status changed', productId: id, from: existing.status, to: payload.status });
    }
    await this.svc.cache.productsChanged();
    return updated;
  }

  // Soft delete (keeps order history consistent)
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id') id: string) {
    const existing = await this.svc.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.svc.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.svc.audit.log({
      action: 'product.delete',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: { ...existing, deletedAt: new Date() },
    });
    this.logger.warn({ msg: 'Product soft-deleted', productId: id });
    await this.svc.cache.productsChanged();
    return { ok: true };
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

  private async prepareProductPayload(dto: CreateProductDto | UpdateProductDto, id?: string) {
    const data: Record<string, any> = { ...dto };
    if (data.name) data.name = data.name.trim();
    if (data.description) data.description = data.description.trim();
    if (!data.slug && data.name) data.slug = data.name;
    if (data.slug) {
      data.slug = await this.svc.slugs.generateUniqueSlug('product', data.slug, id);
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
      const exists = await this.svc.prisma.product.findFirst({
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
    await this.svc.prisma.productStockLog.create({
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
    const branch = await this.svc.prisma.branch.findFirst({
      where: { providerId: product.providerId, status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, isDefault: true },
    });
    if (!branch) {
      this.logger.warn({
        msg: 'No active branch found for product',
        productId: product.id,
        providerId: product.providerId,
      });
      return;
    }
    await this.svc.prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: {},
      create: { branchId: branch.id, productId: product.id, isActive: true },
    });
  }
}
