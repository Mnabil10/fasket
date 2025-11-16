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
var AdminProductsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminProductsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const products_bulk_service_1 = require("./products-bulk.service");
const product_dto_1 = require("./dto/product.dto");
const uploads_service_1 = require("../uploads/uploads.service");
const image_util_1 = require("../uploads/image.util");
const request_context_service_1 = require("../common/context/request-context.service");
let AdminProductsController = AdminProductsController_1 = class AdminProductsController {
    constructor(svc, uploads, bulkService, context) {
        this.svc = svc;
        this.uploads = uploads;
        this.bulkService = bulkService;
        this.context = context;
        this.logger = new common_1.Logger(AdminProductsController_1.name);
    }
    downloadBulkTemplate() {
        const buffer = this.bulkService.generateTemplate();
        return new common_1.StreamableFile(buffer, {
            disposition: 'attachment; filename="products-bulk-template.xlsx"',
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    }
    async bulkUpload(file, dryRun) {
        return this.bulkService.processUpload(file, { dryRun: String(dryRun).toLowerCase() === 'true' });
    }
    async listHotOffers(query) {
        const where = { deletedAt: null, isHotOffer: true };
        if (query.q)
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { slug: { contains: query.q, mode: 'insensitive' } },
            ];
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.product.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: query.skip,
                take: query.take,
            }),
            this.svc.prisma.product.count({ where }),
        ]);
        const mapped = await Promise.all(items.map(async (p) => ({
            ...p,
            imageUrl: await (0, image_util_1.toPublicImageUrl)(p.imageUrl),
        })));
        return { items: mapped, total, page: query.page, pageSize: query.pageSize };
    }
    async list(query) {
        const where = { deletedAt: null };
        if (query.q)
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { slug: { contains: query.q, mode: 'insensitive' } },
            ];
        if (query.categoryId)
            where.categoryId = query.categoryId;
        if (query.status)
            where.status = query.status;
        if (query.minPriceCents !== undefined || query.maxPriceCents !== undefined) {
            where.priceCents = {};
            if (query.minPriceCents !== undefined)
                where.priceCents.gte = query.minPriceCents;
            if (query.maxPriceCents !== undefined)
                where.priceCents.lte = query.maxPriceCents;
        }
        if (query.inStock !== undefined)
            where.stock = query.inStock ? { gt: 0 } : 0;
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
        const mapped = await Promise.all(items.map(async (p) => ({
            ...p,
            imageUrl: await (0, image_util_1.toPublicImageUrl)(p.imageUrl),
        })));
        return { items: mapped, total, page: query.page, pageSize: query.pageSize };
    }
    async one(id) {
        const p = await this.svc.prisma.product.findUnique({ where: { id } });
        if (!p)
            return p;
        return { ...p, imageUrl: await (0, image_util_1.toPublicImageUrl)(p.imageUrl) };
    }
    async create(dto, file) {
        const payload = await this.prepareProductPayload(dto);
        if (file) {
            const image = await this.uploads.processProductImage(file);
            payload.imageUrl = image.url;
            payload.images = this.normalizeImagesInput(image.variants) ?? [];
        }
        const created = await this.svc.prisma.product.create({ data: payload });
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
    async update(id, dto, file) {
        const existing = await this.svc.prisma.product.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Product not found');
        const payload = await this.prepareProductPayload(dto, id);
        if (file) {
            const previousImages = [existing.imageUrl, ...(existing.images ?? [])].filter((url) => !!url);
            const image = await this.uploads.processProductImage(file, previousImages);
            payload.imageUrl = image.url;
            payload.images = this.normalizeImagesInput(image.variants) ?? [];
        }
        const updateData = { ...payload };
        if (Array.isArray(payload.images)) {
            updateData.images = { set: payload.images };
        }
        const updated = await this.svc.prisma.product.update({
            where: { id },
            data: updateData,
        });
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
    async remove(id) {
        const existing = await this.svc.prisma.product.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Product not found');
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
    async prepareProductPayload(dto, id) {
        const data = { ...dto };
        if (data.name)
            data.name = data.name.trim();
        if (data.description)
            data.description = data.description.trim();
        if (!data.slug && data.name)
            data.slug = data.name;
        if (data.slug) {
            data.slug = await this.svc.slugs.generateUniqueSlug('product', data.slug, id);
        }
        if (!data.sku && data.name) {
            data.sku = await this.generateSku(data.name, id);
        }
        else if (data.sku) {
            data.sku = data.sku.toUpperCase();
        }
        if (data.images !== undefined) {
            const normalizedImages = this.normalizeImagesInput(data.images);
            if (normalizedImages !== undefined) {
                data.images = normalizedImages;
            }
            else {
                delete data.images;
            }
        }
        return data;
    }
    normalizeImagesInput(value) {
        if (value === undefined || value === null)
            return undefined;
        let raw = value;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed)
                return [];
            try {
                raw = JSON.parse(trimmed);
            }
            catch {
                raw = trimmed;
            }
        }
        const entries = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
        const normalized = entries
            .map((entry) => {
            if (typeof entry === 'string')
                return entry.trim();
            if (entry && typeof entry === 'object') {
                const candidate = typeof entry.url === 'string'
                    ? entry.url
                    : typeof entry.value === 'string'
                        ? entry.value
                        : undefined;
                return candidate?.trim();
            }
            return undefined;
        })
            .filter((entry) => !!entry);
        return normalized;
    }
    async generateSku(name, excludeId) {
        const base = (name || 'SKU')
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
            if (!exists)
                return candidate;
            attempt += 1;
        }
        return `${base}-${Date.now()}`;
    }
    async recordStockChange(productId, previous, next, reason) {
        if (previous === next)
            return;
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
};
exports.AdminProductsController = AdminProductsController;
__decorate([
    (0, common_1.Get)('bulk-template'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Excel template containing the required header row',
        schema: { type: 'string', format: 'binary' },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminProductsController.prototype, "downloadBulkTemplate", null);
__decorate([
    (0, common_1.Post)('bulk-upload'),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
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
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: (0, multer_1.memoryStorage)() })),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024, message: 'File must not exceed 5MB' }),
            new common_1.FileTypeValidator({ fileType: /(csv|excel|spreadsheetml)/i }),
        ],
    }))),
    __param(1, (0, common_1.Query)('dryRun')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminProductsController.prototype, "bulkUpload", null);
__decorate([
    (0, common_1.Get)('hot-offers'),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated hot offer products' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.ProductListRequestDto]),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.ProductListRequestDto]),
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
                sku: { type: 'string' },
            },
            required: ['name', 'priceCents', 'stock'],
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: (0, multer_1.memoryStorage)(),
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
            new common_1.MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
            new common_1.FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
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
                sku: { type: 'string' },
                image: { type: 'string', format: 'binary' },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        storage: (0, multer_1.memoryStorage)(),
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
            new common_1.MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
            new common_1.FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ }),
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
exports.AdminProductsController = AdminProductsController = AdminProductsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin/Products'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/products', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        uploads_service_1.UploadsService,
        products_bulk_service_1.ProductsBulkService,
        request_context_service_1.RequestContextService])
], AdminProductsController);
//# sourceMappingURL=products.controller.js.map