import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors, BadRequestException, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { CategoryQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { PaginationDto, SortDto } from './dto/pagination.dto';
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

@ApiTags('Admin/Categories')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private svc: AdminService, private uploads: UploadsService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'isActive', required: false, schema: { type: 'boolean' } })
  @ApiOkResponse({ description: 'Paginated categories' })
  async list(@Query() q: CategoryQueryDto, @Query() page: PaginationDto, @Query() sort: SortDto) {
    const where: any = {};
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    if (q.parentId) where.parentId = q.parentId;
    if (q.isActive !== undefined) where.isActive = q.isActive;
    // deletedAt is soft-delete flag
    where.deletedAt = null;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: page.skip, take: page.take,
      }),
      this.svc.prisma.category.count({ where }),
    ]);
    const mapped = await Promise.all(items.map(async (c: any) => ({
      ...c,
      imageUrl: await toBase64DataUrl(c.imageUrl),
    })));
    return { items: mapped, total, page: page.page, pageSize: page.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const c = await this.svc.prisma.category.findUnique({ where: { id } });
    if (!c) return c as any;
    return { ...c, imageUrl: await toBase64DataUrl((c as any).imageUrl) } as any;
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
      required: ['name','slug'],
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: USE_LOCAL ? diskStorage({
      destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const d = new Date();
        const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'categories', String(d.getFullYear()), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0'));
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
    @Body() dto: CreateCategoryDto,
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
    return this.svc.prisma.category.create({ data: dto });
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
    storage: USE_LOCAL ? diskStorage({
      destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const d = new Date();
        const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'categories', String(d.getFullYear()), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0'));
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
    @Body() dto: UpdateCategoryDto,
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
    return this.svc.prisma.category.update({ where: { id }, data: dto });
  }

  // Soft delete: sets deletedAt, keeps referential integrity
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id') id: string) {
    await this.svc.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}
