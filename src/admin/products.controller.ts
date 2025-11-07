import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors, BadRequestException, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { PaginationDto } from './dto/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { UploadsService } from 'src/uploads/uploads.service';
import { toBase64DataUrl } from 'src/uploads/image.util';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

function safeFilename(name: string) {
  const parts = name.split(/\.(?=[^\.]+$)/);
  const base = parts[0] || 'file';
  const ext = parts[1] ? `.${parts[1].toLowerCase()}` : '';
  const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
  return `${slug}${ext}`;
}

const USE_LOCAL = String(process.env.UPLOADS_DRIVER || 's3').toLowerCase() === 'local';
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
const LOCAL_BASE = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');

@ApiTags('Admin/Products')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private svc: AdminService, private uploads: UploadsService) {}

  @Get('hot-offers')
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ description: 'Paginated hot offer products' })
  async listHotOffers(@Query('q') q?: string, @Query() page?: PaginationDto) {
    const where: any = { deletedAt: null, isHotOffer: true };
    if (q) where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ];
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: page?.skip, take: page?.take }),
      this.svc.prisma.product.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (p: any) => ({
      ...p,
      imageUrl: await toBase64DataUrl(p.imageUrl),
    })));
    return { items: mapped, total, page: page?.page, pageSize: page?.pageSize };
  }

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT','ACTIVE','HIDDEN','DISCONTINUED'] })
  @ApiQuery({ name: 'minPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxPriceCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'inStock', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['createdAt','priceCents','name'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['asc','desc'] })
  @ApiOkResponse({ description: 'Paginated products' })
  async list(@Query() q: ProductListQueryDto, @Query() page: PaginationDto) {
    const where: any = { deletedAt: null };
    if (q.q) where.OR = [
      { name: { contains: q.q, mode: 'insensitive' } },
      { slug: { contains: q.q, mode: 'insensitive' } },
    ];
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status) where.status = q.status;
    if (q.minPriceCents || q.maxPriceCents) {
      where.priceCents = {};
      if (q.minPriceCents) where.priceCents.gte = q.minPriceCents;
      if (q.maxPriceCents) where.priceCents.lte = q.maxPriceCents;
    }
    if (q.inStock !== undefined) where.stock = q.inStock ? { gt: 0 } : 0;

    const orderBy = q.orderBy ?? 'createdAt';
    const sort = q.sort ?? 'desc';

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.product.findMany({
        where,
        orderBy: { [orderBy]: sort },
        skip: page.skip, take: page.take,
      }),
      this.svc.prisma.product.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (p: any) => ({
      ...p,
      imageUrl: await toBase64DataUrl(p.imageUrl),
    })));
    return { items: mapped, total, page: page.page, pageSize: page.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const p = await this.svc.prisma.product.findUnique({ where: { id } });
    if (!p) return p as any;
    return { ...p, imageUrl: await toBase64DataUrl((p as any).imageUrl) } as any;
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
      },
      required: ['name','slug','priceCents','stock'],
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: USE_LOCAL ? diskStorage({
      destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const d = new Date();
        const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'products', String(d.getFullYear()), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0'));
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
      },
      filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => cb(null, `${randomUUID()}-${safeFilename(file.originalname)}`),
    }) : memoryStorage(),
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
      const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
        .split(',').map(s => s.trim());
      if (file && !allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported content type') as any, false);
      cb(null, true);
    },
  }))
  async create(
    @Body() dto: CreateProductDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) })
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    if (!dto.slug && dto.name) dto.slug = dto.name.toLowerCase().replace(/\s+/g,'-');
    if (file) {
      if (USE_LOCAL && (file as any).path) {
        const absRoot = path.resolve(process.cwd(), UPLOADS_DIR);
        const rel = path.relative(absRoot, (file as any).path).replace(/\\/g, '/');
        dto.imageUrl = `${LOCAL_BASE}/${rel}`;
      } else {
        const { url } = await this.uploads.uploadBuffer(file);
        dto.imageUrl = url;
      }
    }
    return this.svc.prisma.product.create({ data: dto });
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
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: USE_LOCAL ? diskStorage({
      destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const d = new Date();
        const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'products', String(d.getFullYear()), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0'));
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
      },
      filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => cb(null, `${randomUUID()}-${safeFilename(file.originalname)}`),
    }) : memoryStorage(),
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
      const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
        .split(',').map(s => s.trim());
      if (file && !allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported content type') as any, false);
      cb(null, true);
    },
  }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) })
      ],
      fileIsRequired: false,
    })) file?: Express.Multer.File,
  ) {
    if (file) {
      if (USE_LOCAL && (file as any).path) {
        const absRoot = path.resolve(process.cwd(), UPLOADS_DIR);
        const rel = path.relative(absRoot, (file as any).path).replace(/\\/g, '/');
        dto.imageUrl = `${LOCAL_BASE}/${rel}`;
      } else {
        const { url } = await this.uploads.uploadBuffer(file);
        dto.imageUrl = url;
      }
    }
    return this.svc.prisma.product.update({ where: { id }, data: dto });
  }

  // Soft delete (keeps order history consistent)
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id') id: string) {
    await this.svc.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}
