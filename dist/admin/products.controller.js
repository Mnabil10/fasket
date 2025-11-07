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
exports.AdminProductsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const product_dto_1 = require("./dto/product.dto");
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
let AdminProductsController = class AdminProductsController {
    constructor(svc, uploads) {
        this.svc = svc;
        this.uploads = uploads;
    }
    async listHotOffers(q, page) {
        const where = { deletedAt: null, isHotOffer: true };
        if (q)
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
            ];
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: page?.skip, take: page?.take }),
            this.svc.prisma.product.count({ where }),
        ]);
        const mapped = await Promise.all(items.map(async (p) => ({
            ...p,
            imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl),
        })));
        return { items: mapped, total, page: page?.page, pageSize: page?.pageSize };
    }
    async list(q, page) {
        const where = { deletedAt: null };
        if (q.q)
            where.OR = [
                { name: { contains: q.q, mode: 'insensitive' } },
                { slug: { contains: q.q, mode: 'insensitive' } },
            ];
        if (q.categoryId)
            where.categoryId = q.categoryId;
        if (q.status)
            where.status = q.status;
        if (q.minPriceCents || q.maxPriceCents) {
            where.priceCents = {};
            if (q.minPriceCents)
                where.priceCents.gte = q.minPriceCents;
            if (q.maxPriceCents)
                where.priceCents.lte = q.maxPriceCents;
        }
        if (q.inStock !== undefined)
            where.stock = q.inStock ? { gt: 0 } : 0;
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
        const mapped = await Promise.all(items.map(async (p) => ({
            ...p,
            imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl),
        })));
        return { items: mapped, total, page: page.page, pageSize: page.pageSize };
    }
    async one(id) {
        const p = await this.svc.prisma.product.findUnique({ where: { id } });
        if (!p)
            return p;
        return { ...p, imageUrl: await (0, image_util_1.toBase64DataUrl)(p.imageUrl) };
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
        return this.svc.prisma.product.create({ data: dto });
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
        return this.svc.prisma.product.update({ where: { id }, data: dto });
    }
    async remove(id) {
        await this.svc.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
        return { ok: true };
    }
};
exports.AdminProductsController = AdminProductsController;
__decorate([
    (0, common_1.Get)('hot-offers'),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated hot offer products' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "listHotOffers", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'categoryId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['DRAFT', 'ACTIVE', 'HIDDEN', 'DISCONTINUED'] }),
    (0, swagger_1.ApiQuery)({ name: 'minPriceCents', required: false, schema: { type: 'integer' } }),
    (0, swagger_1.ApiQuery)({ name: 'maxPriceCents', required: false, schema: { type: 'integer' } }),
    (0, swagger_1.ApiQuery)({ name: 'inStock', required: false, schema: { type: 'boolean' } }),
    (0, swagger_1.ApiQuery)({ name: 'orderBy', required: false, enum: ['createdAt', 'priceCents', 'name'] }),
    (0, swagger_1.ApiQuery)({ name: 'sort', required: false, enum: ['asc', 'desc'] }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated products' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.ProductListQueryDto, pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "one", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                priceCents: { type: 'integer' },
                salePriceCents: { type: 'integer' },
                stock: { type: 'integer' },
                status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'HIDDEN', 'DISCONTINUED'] },
                categoryId: { type: 'string' },
                image: { type: 'string', format: 'binary' },
            },
            required: ['name', 'slug', 'priceCents', 'stock'],
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: USE_LOCAL ? (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const d = new Date();
                const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'products', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
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
    __metadata("design:paramtypes", [product_dto_1.CreateProductDto, Object]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                priceCents: { type: 'integer' },
                salePriceCents: { type: 'integer' },
                stock: { type: 'integer' },
                status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'HIDDEN', 'DISCONTINUED'] },
                categoryId: { type: 'string' },
                image: { type: 'string', format: 'binary' },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: USE_LOCAL ? (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const d = new Date();
                const dest = path.resolve(process.cwd(), UPLOADS_DIR, 'products', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
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
    __metadata("design:paramtypes", [String, product_dto_1.UpdateProductDto, Object]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, _admin_guards_1.AdminOnly)(),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "remove", null);
exports.AdminProductsController = AdminProductsController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Products'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)('admin/products'),
    __metadata("design:paramtypes", [admin_service_1.AdminService, uploads_service_1.UploadsService])
], AdminProductsController);
//# sourceMappingURL=products.controller.js.map