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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsBulkService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const XLSX = require("xlsx");
const sync_1 = require("csv-parse/sync");
const prisma_service_1 = require("../prisma/prisma.service");
const slug_service_1 = require("../common/slug/slug.service");
const cache_invalidation_service_1 = require("../common/cache/cache-invalidation.service");
const request_context_service_1 = require("../common/context/request-context.service");
const slug_util_1 = require("../common/utils/slug.util");
const TEMPLATE_HEADERS = [
    'name',
    'nameAr',
    'slug',
    'sku',
    'description',
    'descriptionAr',
    'price',
    'salePrice',
    'stock',
    'status',
    'categorySlug',
    'imageUrl',
    'images',
    'isHotOffer',
];
class RowError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
let ProductsBulkService = class ProductsBulkService {
    constructor(prisma, slugs, cache, context) {
        this.prisma = prisma;
        this.slugs = slugs;
        this.cache = cache;
        this.context = context;
        this.statusSet = new Set(Object.values(client_1.ProductStatus));
        this.batchSize = Number(process.env.BULK_PRODUCT_BATCH_SIZE || 25);
    }
    generateTemplate() {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
        const binary = XLSX.write(workbook, { type: 'binary', bookType: 'xlsx' });
        return Buffer.from(binary, 'binary');
    }
    async processUpload(file, options = {}) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        if (!file.buffer?.length) {
            throw new common_1.BadRequestException('Uploaded file is empty');
        }
        const rows = this.extractRows(file);
        if (!rows.length) {
            throw new common_1.BadRequestException('No product rows were found in the file');
        }
        const categoryMap = await this.buildCategoryMap(rows);
        const slugMap = new Map();
        const skuMap = new Map();
        const result = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            rows: [],
            dryRun: !!options.dryRun,
        };
        const rowKeys = new Set();
        const parsedRows = [];
        for (const row of rows) {
            try {
                const values = await this.mapRowToProduct(row.values, categoryMap);
                parsedRows.push({ rowNumber: row.rowNumber, values });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const code = error instanceof RowError ? error.code : 'ROW_ERROR';
                result.errors.push({ row: row.rowNumber, code, message });
                result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
            }
        }
        const slugCandidates = Array.from(new Set(parsedRows
            .map((row) => row.values.slug ?? (0, slug_util_1.slugify)(row.values.name))
            .filter((slug) => !!slug)));
        const skuCandidates = Array.from(new Set(parsedRows.map((row) => row.values.sku).filter((sku) => !!sku)));
        if (slugCandidates.length || skuCandidates.length) {
            const existingProducts = await this.prisma.product.findMany({
                where: {
                    OR: [
                        ...(slugCandidates.length ? [{ slug: { in: slugCandidates } }] : []),
                        ...(skuCandidates.length ? [{ sku: { in: skuCandidates } }] : []),
                    ],
                },
            });
            existingProducts.forEach((product) => {
                slugMap.set(product.slug, product);
                if (product.sku)
                    skuMap.set(product.sku, product);
            });
        }
        const operations = [];
        for (const row of parsedRows) {
            try {
                const values = { ...row.values };
                const dedupeKey = `${values.slug ?? values.name}:${values.sku ?? ''}`;
                if (rowKeys.has(dedupeKey)) {
                    throw new RowError('DUPLICATE_ROW', 'Duplicate slug/SKU in file. Row skipped.');
                }
                rowKeys.add(dedupeKey);
                const existing = await this.resolveExistingProduct(values, slugMap, skuMap);
                if (existing) {
                    values.slug = existing.slug;
                    values.sku = values.sku ?? existing.sku ?? (await this.generateSku(values.name));
                }
                else {
                    values.slug = await this.slugs.generateUniqueSlug('product', values.slug ?? values.name);
                    values.sku = values.sku ?? (await this.generateSku(values.name));
                }
                operations.push({
                    rowNumber: row.rowNumber,
                    values,
                    existing: existing || undefined,
                    action: existing ? 'update' : 'create',
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const code = error instanceof RowError ? error.code : 'ROW_ERROR';
                result.errors.push({ row: row.rowNumber, code, message });
                result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
            }
        }
        for (let i = 0; i < operations.length; i += this.batchSize) {
            const batch = operations.slice(i, i + this.batchSize);
            const outcomes = await Promise.allSettled(batch.map((op) => this.applyOperation(op, !!options.dryRun)));
            outcomes.forEach((outcome, idx) => {
                const op = batch[idx];
                if (outcome.status === 'rejected') {
                    const message = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error';
                    result.errors.push({ row: op.rowNumber, code: 'ROW_ERROR', message });
                    result.rows.push({ rowNumber: op.rowNumber, status: 'error', errorMessage: message, errorCode: 'ROW_ERROR' });
                    return;
                }
                const data = outcome.value;
                result.rows.push({
                    rowNumber: op.rowNumber,
                    status: data.status,
                    productId: data.productId,
                    dryRun: options.dryRun,
                });
                if (data.status === 'created')
                    result.created += 1;
                if (data.status === 'updated')
                    result.updated += 1;
                if (data.status === 'skipped')
                    result.skipped += 1;
            });
        }
        if (!options.dryRun && (result.created || result.updated)) {
            await this.cache.productsChanged();
        }
        return result;
    }
    async applyOperation(op, dryRun) {
        const data = this.compactData({
            name: op.values.name,
            nameAr: op.values.nameAr,
            slug: op.values.slug,
            description: op.values.description,
            descriptionAr: op.values.descriptionAr,
            imageUrl: op.values.imageUrl,
            priceCents: op.values.priceCents,
            salePriceCents: op.values.salePriceCents,
            stock: op.values.stock,
            status: op.values.status,
            categoryId: op.values.categoryId,
            images: op.values.images,
            isHotOffer: op.values.isHotOffer,
            sku: op.values.sku,
        });
        if (op.action === 'update' && op.existing) {
            const hasChanges = Object.entries(data).some(([key, value]) => {
                const current = op.existing[key];
                if (Array.isArray(value)) {
                    return JSON.stringify(current ?? []) !== JSON.stringify(value);
                }
                return current !== value;
            });
            if (!hasChanges) {
                return { status: 'skipped', productId: op.existing.id };
            }
            if (dryRun) {
                return { status: 'updated', productId: op.existing.id };
            }
            const updated = await this.prisma.product.update({
                where: { id: op.existing.id },
                data: data,
            });
            if (op.values.stock !== undefined && op.existing.stock !== op.values.stock) {
                await this.recordStockChange(op.existing.id, op.existing.stock, op.values.stock, 'bulk.upload');
            }
            return { status: 'updated', productId: updated.id };
        }
        if (dryRun) {
            return { status: 'created' };
        }
        const created = await this.prisma.product.create({ data: data });
        return { status: 'created', productId: created.id };
    }
    extractRows(file) {
        const ext = file.originalname?.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const entries = XLSX.utils.sheet_to_json(sheet, { header: Array.from(TEMPLATE_HEADERS), range: 1 });
            return entries
                .map((values, idx) => ({ rowNumber: idx + 2, values }))
                .filter((row) => this.hasAnyValue(row.values));
        }
        const csv = file.buffer.toString('utf8');
        const records = (0, sync_1.parse)(csv, {
            columns: Array.from(TEMPLATE_HEADERS),
            from_line: 2,
            skip_empty_lines: true,
            trim: true,
        });
        return records.map((values, idx) => ({ rowNumber: idx + 2, values }));
    }
    hasAnyValue(row) {
        return Object.values(row).some((value) => value !== undefined && String(value).trim() !== '');
    }
    async buildCategoryMap(rows) {
        const slugs = Array.from(new Set(rows
            .map((row) => row.values.categorySlug?.toString().trim().toLowerCase())
            .filter((slug) => !!slug)));
        if (!slugs.length)
            return new Map();
        const categories = await this.prisma.category.findMany({
            where: { slug: { in: slugs }, deletedAt: null },
            select: { id: true, slug: true },
        });
        return new Map(categories.map((category) => [category.slug.toLowerCase(), category.id]));
    }
    async resolveExistingProduct(values, slugMap, skuMap) {
        if (values.slug && slugMap.has(values.slug))
            return slugMap.get(values.slug);
        if (values.sku && skuMap.has(values.sku))
            return skuMap.get(values.sku);
        const where = { OR: [] };
        if (values.slug)
            where.OR.push({ slug: values.slug });
        if (values.sku)
            where.OR.push({ sku: values.sku });
        if (!where.OR.length)
            return null;
        const product = await this.prisma.product.findFirst({ where });
        if (product) {
            slugMap.set(product.slug, product);
            if (product.sku)
                skuMap.set(product.sku, product);
        }
        return product;
    }
    async mapRowToProduct(row, categoryMap) {
        const name = this.requireString(row.name, 'name');
        const slugValue = this.optionalString(row.slug);
        const skuValue = this.optionalString(row.sku);
        const slug = slugValue ? (0, slug_util_1.slugify)(slugValue) : undefined;
        const sku = skuValue ? skuValue.toUpperCase() : undefined;
        const priceCents = this.parseMoney(row.price, 'price');
        const salePriceCents = this.optionalMoney(row.salePrice);
        const stock = this.parseInteger(row.stock, 'stock');
        const status = this.parseStatus(row.status);
        const categoryId = await this.resolveCategory(row.categorySlug, categoryMap);
        const images = this.parseImages(row.images);
        return {
            slug,
            sku,
            name,
            nameAr: this.optionalString(row.nameAr),
            description: this.optionalString(row.description),
            descriptionAr: this.optionalString(row.descriptionAr),
            imageUrl: this.optionalString(row.imageUrl),
            priceCents,
            salePriceCents,
            stock,
            status,
            categoryId,
            images,
            isHotOffer: this.parseBoolean(row.isHotOffer),
        };
    }
    async resolveCategory(slugValue, categoryMap) {
        if (!this.hasValue(slugValue)) {
            return undefined;
        }
        const slug = String(slugValue).trim().toLowerCase();
        const id = categoryMap.get(slug);
        if (!id) {
            throw new RowError('CATEGORY_NOT_FOUND', `Category with slug "${slug}" was not found`);
        }
        return id;
    }
    parseMoney(value, field) {
        if (!this.hasValue(value)) {
            throw new RowError('VALIDATION_ERROR', `${field} is required`);
        }
        const numeric = Number(String(value).replace(/,/g, '').trim());
        if (!Number.isFinite(numeric)) {
            throw new RowError('VALIDATION_ERROR', `${field} must be a valid number`);
        }
        const cents = Math.round(numeric * 100);
        if (cents < 0) {
            throw new RowError('VALIDATION_ERROR', `${field} must be zero or greater`);
        }
        return cents;
    }
    optionalMoney(value) {
        if (!this.hasValue(value))
            return undefined;
        return this.parseMoney(value, 'salePrice');
    }
    parseInteger(value, field) {
        if (!this.hasValue(value)) {
            throw new RowError('VALIDATION_ERROR', `${field} is required`);
        }
        const numeric = Number(String(value).trim());
        if (!Number.isFinite(numeric)) {
            throw new RowError('VALIDATION_ERROR', `${field} must be a valid number`);
        }
        const intValue = Math.floor(numeric);
        if (intValue < 0) {
            throw new RowError('VALIDATION_ERROR', `${field} must be zero or greater`);
        }
        return intValue;
    }
    parseStatus(value) {
        if (!this.hasValue(value)) {
            return client_1.ProductStatus.ACTIVE;
        }
        const normalized = String(value).trim().toUpperCase();
        if (!this.statusSet.has(normalized)) {
            throw new RowError('VALIDATION_ERROR', `status must be one of: ${Array.from(this.statusSet).join(', ')}`);
        }
        return normalized;
    }
    parseBoolean(value) {
        if (!this.hasValue(value)) {
            return false;
        }
        const normalized = String(value).trim().toLowerCase();
        if (['1', 'true', 'yes', 'y'].includes(normalized)) {
            return true;
        }
        if (['0', 'false', 'no', 'n'].includes(normalized)) {
            return false;
        }
        throw new RowError('VALIDATION_ERROR', 'isHotOffer must be true or false');
    }
    optionalString(value) {
        return this.hasValue(value) ? String(value).trim() : undefined;
    }
    parseImages(value) {
        if (!this.hasValue(value)) {
            return [];
        }
        return String(value)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    requireString(value, field) {
        if (!this.hasValue(value)) {
            throw new RowError('VALIDATION_ERROR', `${field} is required`);
        }
        return String(value).trim();
    }
    hasValue(value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }
    compactData(data) {
        return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    }
    async generateSku(name) {
        const base = name
            .replace(/[^a-z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 6) || 'SKU';
        let attempt = 0;
        while (attempt < 10) {
            const candidate = `${base}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const exists = await this.prisma.product.findFirst({ where: { sku: candidate } });
            if (!exists)
                return candidate;
            attempt += 1;
        }
        return `${base}-${Date.now()}`;
    }
    async recordStockChange(productId, previous, next, reason) {
        if (previous === next)
            return;
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
};
exports.ProductsBulkService = ProductsBulkService;
exports.ProductsBulkService = ProductsBulkService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        slug_service_1.SlugService,
        cache_invalidation_service_1.CacheInvalidationService,
        request_context_service_1.RequestContextService])
], ProductsBulkService);
//# sourceMappingURL=products-bulk.service.js.map