import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Product, ProductStatus } from '@prisma/client';
import { Express } from 'express';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { PrismaService } from 'src/prisma/prisma.service';
import { SlugService } from '../common/slug/slug.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { RequestContextService } from '../common/context/request-context.service';
import { slugify } from '../common/utils/slug.util';

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
] as const;

type HeaderKey = (typeof TEMPLATE_HEADERS)[number];
type BulkRow = Record<HeaderKey, any>;

interface ParsedRow {
  rowNumber: number;
  values: BulkRow;
}

interface ProductWriteValues {
  slug?: string;
  sku?: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  imageUrl?: string;
  priceCents: number;
  salePriceCents?: number;
  stock: number;
  status: ProductStatus;
  categoryId?: string;
  images: string[];
  isHotOffer: boolean;
}

interface ValidatedRow {
  rowNumber: number;
  values: ProductWriteValues;
}

interface PreparedOperation {
  rowNumber: number;
  values: ProductWriteValues;
  action: 'create' | 'update';
  existing?: Product;
}

export interface RowResult {
  rowNumber: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  productId?: string;
  errorMessage?: string;
  errorCode?: string;
  dryRun?: boolean;
}

export interface BulkUploadResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; code: string; message: string }[];
  rows: RowResult[];
  dryRun: boolean;
}

class RowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

@Injectable()
export class ProductsBulkService {
  private readonly statusSet = new Set<string>(Object.values(ProductStatus));
  private readonly batchSize = Number(process.env.BULK_PRODUCT_BATCH_SIZE || 25);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly cache: CacheInvalidationService,
    private readonly context: RequestContextService,
  ) {}

  generateTemplate(): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    const binary = XLSX.write(workbook, { type: 'binary', bookType: 'xlsx' });
    return Buffer.from(binary, 'binary');
  }

  async processUpload(file: Express.Multer.File, options: { dryRun?: boolean } = {}): Promise<BulkUploadResult> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const rows = this.extractRows(file);
    if (!rows.length) {
      throw new BadRequestException('No product rows were found in the file');
    }

    const categoryMap = await this.buildCategoryMap(rows);
    const slugMap = new Map<string, Product>();
    const skuMap = new Map<string, Product>();
    const result: BulkUploadResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      rows: [],
      dryRun: !!options.dryRun,
    };
    const rowKeys = new Set<string>();

    const parsedRows: ValidatedRow[] = [];
    for (const row of rows) {
      try {
        const values = await this.mapRowToProduct(row.values, categoryMap);
        parsedRows.push({ rowNumber: row.rowNumber, values });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code = error instanceof RowError ? error.code : 'ROW_ERROR';
        result.errors.push({ row: row.rowNumber, code, message });
        result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
      }
    }

    const slugCandidates = Array.from(
      new Set(
        parsedRows
          .map((row) => row.values.slug ?? slugify(row.values.name))
          .filter((slug): slug is string => !!slug),
      ),
    );
    const skuCandidates = Array.from(
      new Set(parsedRows.map((row) => row.values.sku).filter((sku): sku is string => !!sku)),
    );
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
        if (product.sku) skuMap.set(product.sku, product);
      });
    }

    const operations: PreparedOperation[] = [];
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
        } else {
          values.slug = await this.slugs.generateUniqueSlug('product', values.slug ?? values.name);
          values.sku = values.sku ?? (await this.generateSku(values.name));
        }
        operations.push({
          rowNumber: row.rowNumber,
          values,
          existing: existing || undefined,
          action: existing ? 'update' : 'create',
        });
      } catch (error) {
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
        if (data.status === 'created') result.created += 1;
        if (data.status === 'updated') result.updated += 1;
        if (data.status === 'skipped') result.skipped += 1;
      });
    }

    if (!options.dryRun && (result.created || result.updated)) {
      await this.cache.productsChanged();
    }
    return result;
  }

  private async applyOperation(op: PreparedOperation, dryRun: boolean) {
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
        const current = (op.existing as any)[key];
        if (Array.isArray(value)) {
          return JSON.stringify(current ?? []) !== JSON.stringify(value);
        }
        return current !== value;
      });
      if (!hasChanges) {
        return { status: 'skipped' as const, productId: op.existing.id };
      }
      if (dryRun) {
        return { status: 'updated' as const, productId: op.existing.id };
      }
      const updated = await this.prisma.product.update({
        where: { id: op.existing.id },
        data: data as Prisma.ProductUncheckedUpdateInput,
      });
      if (op.values.stock !== undefined && op.existing.stock !== op.values.stock) {
        await this.recordStockChange(op.existing.id, op.existing.stock, op.values.stock, 'bulk.upload');
      }
      return { status: 'updated' as const, productId: updated.id };
    }

    if (dryRun) {
      return { status: 'created' as const };
    }
    const created = await this.prisma.product.create({ data: data as Prisma.ProductUncheckedCreateInput });
    return { status: 'created' as const, productId: created.id };
  }

  private extractRows(file: Express.Multer.File): ParsedRow[] {
    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const entries = XLSX.utils.sheet_to_json<BulkRow>(sheet, { header: Array.from(TEMPLATE_HEADERS), range: 1 });
      return entries
        .map((values, idx) => ({ rowNumber: idx + 2, values }))
        .filter((row) => this.hasAnyValue(row.values));
    }
    const csv = file.buffer.toString('utf8');
    const records = parse(csv, {
      columns: Array.from(TEMPLATE_HEADERS),
      from_line: 2,
      skip_empty_lines: true,
      trim: true,
    }) as BulkRow[];
    return records.map((values, idx) => ({ rowNumber: idx + 2, values }));
  }

  private hasAnyValue(row: BulkRow) {
    return Object.values(row).some((value) => value !== undefined && String(value).trim() !== '');
  }

  private async buildCategoryMap(rows: ParsedRow[]) {
    const slugs = Array.from(
      new Set(
        rows
          .map((row) => row.values.categorySlug?.toString().trim().toLowerCase())
          .filter((slug): slug is string => !!slug),
      ),
    );
    if (!slugs.length) return new Map<string, string>();
    const categories = await this.prisma.category.findMany({
      where: { slug: { in: slugs }, deletedAt: null },
      select: { id: true, slug: true },
    });
    return new Map(categories.map((category) => [category.slug.toLowerCase(), category.id]));
  }

  private async resolveExistingProduct(
    values: ProductWriteValues,
    slugMap: Map<string, Product>,
    skuMap: Map<string, Product>,
  ): Promise<Product | null> {
    if (values.slug && slugMap.has(values.slug)) return slugMap.get(values.slug)!;
    if (values.sku && skuMap.has(values.sku)) return skuMap.get(values.sku)!;
    const where: any = { OR: [] as any[] };
    if (values.slug) where.OR.push({ slug: values.slug });
    if (values.sku) where.OR.push({ sku: values.sku });
    if (!where.OR.length) return null;
    const product = await this.prisma.product.findFirst({ where });
    if (product) {
      slugMap.set(product.slug, product);
      if (product.sku) skuMap.set(product.sku, product);
    }
    return product;
  }

  private async mapRowToProduct(row: BulkRow, categoryMap: Map<string, string>) {
    const name = this.requireString(row.name, 'name');
    const slugValue = this.optionalString(row.slug);
    const skuValue = this.optionalString(row.sku);
    const slug = slugValue ? slugify(slugValue) : undefined;
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

  private async resolveCategory(slugValue: any, categoryMap: Map<string, string>) {
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

  private parseMoney(value: any, field: string) {
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

  private optionalMoney(value: any) {
    if (!this.hasValue(value)) return undefined;
    return this.parseMoney(value, 'salePrice');
  }

  private parseInteger(value: any, field: string) {
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

  private parseStatus(value: any): ProductStatus {
    if (!this.hasValue(value)) {
      return ProductStatus.ACTIVE;
    }
    const normalized = String(value).trim().toUpperCase();
    if (!this.statusSet.has(normalized)) {
      throw new RowError('VALIDATION_ERROR', `status must be one of: ${Array.from(this.statusSet).join(', ')}`);
    }
    return normalized as ProductStatus;
  }

  private parseBoolean(value: any) {
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

  private optionalString(value: any) {
    return this.hasValue(value) ? String(value).trim() : undefined;
  }

  private parseImages(value: any) {
    if (!this.hasValue(value)) {
      return [];
    }
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private requireString(value: any, field: string) {
    if (!this.hasValue(value)) {
      throw new RowError('VALIDATION_ERROR', `${field} is required`);
    }
    return String(value).trim();
  }

  private hasValue(value: any) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  private compactData<T extends Record<string, any>>(data: T) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
  }

  private async generateSku(name: string) {
    const base =
      name
        .replace(/[^a-z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 6) || 'SKU';
    let attempt = 0;
    while (attempt < 10) {
      const candidate = `${base}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const exists = await this.prisma.product.findFirst({ where: { sku: candidate } });
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
}
