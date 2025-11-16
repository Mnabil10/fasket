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
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const category_dto_1 = require("./dto/category.dto");
const uploads_service_1 = require("../uploads/uploads.service");
const image_util_1 = require("../uploads/image.util");
let AdminCategoriesController = class AdminCategoriesController {
    constructor(svc, uploads) {
        this.svc = svc;
        this.uploads = uploads;
    }
    async list(query) {
        const where = {};
        if (query.q)
            where.name = { contains: query.q, mode: 'insensitive' };
        if (query.parentId)
            where.parentId = query.parentId;
        if (query.isActive !== undefined)
            where.isActive = query.isActive;
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
        const mapped = await Promise.all(items.map(async (c) => ({
            ...c,
            imageUrl: await (0, image_util_1.toPublicImageUrl)(c.imageUrl),
        })));
        return { items: mapped, total, page: query.page, pageSize: query.pageSize };
    }
    async one(id) {
        const c = await this.svc.prisma.category.findUnique({ where: { id } });
        if (!c)
            return c;
        return { ...c, imageUrl: await (0, image_util_1.toPublicImageUrl)(c.imageUrl) };
    }
    async create(dto, file) {
        const payload = await this.prepareCategoryPayload(dto);
        if (file) {
            const uploaded = await this.uploads.processImageAsset(file, { folder: 'categories', generateVariants: false });
            payload.imageUrl = uploaded.url;
        }
        const created = await this.svc.prisma.category.create({ data: payload });
        await this.svc.audit.log({
            action: 'category.create',
            entity: 'Category',
            entityId: created.id,
            after: created,
        });
        await this.svc.cache.categoriesChanged();
        return created;
    }
    async update(id, dto, file) {
        const existing = await this.svc.prisma.category.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Category not found');
        const payload = await this.prepareCategoryPayload(dto, id);
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
            data: payload,
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
    async remove(id) {
        const existing = await this.svc.prisma.category.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Category not found');
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
    async prepareCategoryPayload(dto, id) {
        const data = { ...dto };
        if (data.name)
            data.name = data.name.trim();
        if (!data.slug && data.name)
            data.slug = data.name;
        if (data.slug) {
            data.slug = await this.svc.slugs.generateUniqueSlug('category', data.slug, id);
        }
        return data;
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [category_dto_1.CategoryListQueryDto]),
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
            required: ['name'],
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
    (0, common_1.Controller)({ path: 'admin/categories', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService, uploads_service_1.UploadsService])
], AdminCategoriesController);
//# sourceMappingURL=categories.controller.js.map