"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminCategoriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const category_dto_1 = require("./dto/category.dto");
const pagination_dto_1 = require("./dto/pagination.dto");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const uploads_service_1 = require("../uploads/uploads.service");
const image_util_1 = require("../uploads/image.util");
const path = require("path");
const fs = require("fs");
const crypto_1 = require("crypto");
function safeFilename(name) {
    const parts = name.split(/\.(?=[^\.]+$)/);
    const base = parts[0] || 'file';
    const ext = parts[1] ? `.${parts[1].toLowerCase()}` : '';
    const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
    return `${slug}${ext}`;
}
const USE_LOCAL = String(process.env.UPLOADS_DRIVER || 's3').toLowerCase() === 'local';
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
const LOCAL_BASE = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');
let AdminCategoriesController = class AdminCategoriesController {
    constructor(svc, uploads) {
        this.svc = svc;
        this.uploads = uploads;
    }
    async list(q, page, sort) {
        const where = {};
        if (q.q)
            where.name = { contains: q.q, mode: 'insensitive' };
        if (q.parentId)
            where.parentId = q.parentId;
        if (q.isActive !== undefined)
            where.isActive = q.isActive;
        where.deletedAt = null;
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.category.findMany({
                where,
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                skip: page.skip, take: page.take,
            }),
            this.svc.prisma.category.count({ where }),
        ]);
        const mapped = await Promise.all(items.map(async (c) => ({
            ...c,
            imageUrl: await (0, image_util_1.toBase64DataUrl)(c.imageUrl),
        })));
        return { items: mapped, total, page: page.page, pageSize: page.pageSize };
    }
    async one(id) {
        const c = await this.svc.prisma.category.findUnique({ where: { id } });
        if (!c)
            return c;
        return { ...c, imageUrl: await (0, image_util_1.toBase64DataUrl)(c.imageUrl) };
    }
    async create(dto, file) {
        if (!dto.slug && dto.name)
            dto.slug = dto.name.toLowerCase().replace(/\s+/g, '-');
        if (file) {
            if (USE_LOCAL && file.path) {
                const absRoot = path.resolve(process.cwd(), UPLOADS_DIR);
                const rel = path.relative(absRoot, file.path).replace(/\\/g, '/');
                dto.imageUrl = `${LOCAL_BASE}/${rel}`;
            }
            else {
                const { url } = await this.uploads.uploadBuffer(file);
                dto.imageUrl = url;
            }
        }
        return this.svc.prisma.category.create({ data: dto });
    }
    async update(id, dto, file) {
        if (file) {
            if (USE_LOCAL && file.path) {
                const absRoot = path.resolve(process.cwd(), UPLOADS_DIR);
                const rel = path.relative(absRoot, file.path).replace(/\\/g, '/');
                dto.imageUrl = `${LOCAL_BASE}/${rel}`;
            }
            else {
                const { url } = await this.uploads.uploadBuffer(file);
                dto.imageUrl = url;
            }
        }
        return this.svc.prisma.category.update({ where: { id }, data: dto });
    }
    async remove(id) {
        await this.svc.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
        return { ok: true };
    }
};
exports.AdminCategoriesController = AdminCategoriesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'parentId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, schema: { type: 'boolean' } }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated categories' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [category_dto_1.CategoryQueryDto, pagination_dto_1.PaginationDto, pagination_dto_1.SortDto]),
    __metadata("design:returntype", Promise)
], AdminCategoriesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminCategoriesController.prototype, "one", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
            required: ['name', 'slug'],
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: USE_LOCAL ? (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const d = new Date();
                const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'categories', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
                fs.mkdirSync(dest, { recursive: true });
                cb(null, dest);
            },
            filename: (req, file, cb) => cb(null, `${(0, crypto_1.randomUUID)()}-${safeFilename(file.originalname)}`),
        }) : (0, multer_1.memoryStorage)(),
        limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
        fileFilter: (req, file, cb) => {
            const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
                .split(',').map(s => s.trim());
            if (file && !allowed.includes(file.mimetype))
                return cb(new common_1.BadRequestException('Unsupported content type'), false);
            cb(null, true);
        },
    })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) })
        ],
        fileIsRequired: false,
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [category_dto_1.CreateCategoryDto, Object]),
    __metadata("design:returntype", Promise)
], AdminCategoriesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: USE_LOCAL ? (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const d = new Date();
                const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'categories', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
                fs.mkdirSync(dest, { recursive: true });
                cb(null, dest);
            },
            filename: (req, file, cb) => cb(null, `${(0, crypto_1.randomUUID)()}-${safeFilename(file.originalname)}`),
        }) : (0, multer_1.memoryStorage)(),
        limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
        fileFilter: (req, file, cb) => {
            const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
                .split(',').map(s => s.trim());
            if (file && !allowed.includes(file.mimetype))
                return cb(new common_1.BadRequestException('Unsupported content type'), false);
            cb(null, true);
        },
    })),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) })
        ],
        fileIsRequired: false,
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, category_dto_1.UpdateCategoryDto, Object]),
    __metadata("design:returntype", Promise)
], AdminCategoriesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, _admin_guards_1.AdminOnly)(),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminCategoriesController.prototype, "remove", null);
exports.AdminCategoriesController = AdminCategoriesController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Categories'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)('admin/categories'),
    __metadata("design:paramtypes", [admin_service_1.AdminService, uploads_service_1.UploadsService])
], AdminCategoriesController);
//# sourceMappingURL=categories.controller.js.map