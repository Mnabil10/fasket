import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Product,
  ProductStatus,
  ProductOptionGroupPriceMode,
  ProductOptionGroupType,
} from '@prisma/client';
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
  'providerSlug',
  'categorySlug',
  'imageUrl',
  'images',
  'isHotOffer',
  'optionGroupName',
  'optionGroupNameAr',
  'optionGroupType',
  'optionGroupPriceMode',
  'optionGroupMinSelected',
  'optionGroupMaxSelected',
  'optionGroupOptions',
] as const;

type HeaderKey = (typeof TEMPLATE_HEADERS)[number];
type BulkRow = Record<HeaderKey, any>;

interface ParsedRow {
  rowNumber: number;
  values: BulkRow;
}

interface OptionWriteValues {
  name: string;
  nameAr?: string | null;
  priceCents: number;
  maxQtyPerOption?: number | null;
  sortOrder: number;
  isActive: boolean;
}

interface OptionGroupWriteValues {
  name: string;
  nameAr?: string | null;
  type: ProductOptionGroupType;
  priceMode: ProductOptionGroupPriceMode;
  minSelected: number;
  maxSelected?: number | null;
  options: OptionWriteValues[];
}

interface ProductWriteValues {
  slug?: string;
  sku?: string;
  providerId?: string;
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
  optionGroup?: OptionGroupWriteValues | null;
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
  providerId?: string;
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
  private readonly logger = new Logger(ProductsBulkService.name);
  private readonly statusSet = new Set<string>(Object.values(ProductStatus));
  private readonly groupTypeSet = new Set<string>(Object.values(ProductOptionGroupType));
  private readonly priceModeSet = new Set<string>(Object.values(ProductOptionGroupPriceMode));
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

  async processUpload(
    file: Express.Multer.File,
    options: { dryRun?: boolean; providerId?: string } = {},
  ): Promise<BulkUploadResult> {
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

    const providerMap = await this.buildProviderMap(rows);
    const providerByRow = new Map<number, string | undefined>();
    const rowsWithProvider: ParsedRow[] = [];
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

    for (const row of rows) {
      try {
        const providerId = this.resolveProviderId(row.values, providerMap, options.providerId);
        providerByRow.set(row.rowNumber, providerId);
        rowsWithProvider.push(row);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code = error instanceof RowError ? error.code : 'ROW_ERROR';
        result.errors.push({ row: row.rowNumber, code, message });
        result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
      }
    }

    const categoryMap = await this.buildCategoryMap(rowsWithProvider, providerByRow);

    const parsedRows: ValidatedRow[] = [];
    for (const row of rowsWithProvider) {
      try {
        const providerId = providerByRow.get(row.rowNumber);
        const values = await this.mapRowToProduct(row.values, categoryMap, providerId);
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
        const existing = await this.resolveExistingProduct(values, slugMap, skuMap, values.providerId);
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
          providerId: values.providerId,
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
      providerId: op.providerId,
    });
    const optionGroup = op.values.optionGroup ?? null;
    const hasOptionGroup = Boolean(optionGroup);

    if (op.action === 'update' && op.existing) {
      if (op.providerId && op.existing.providerId !== op.providerId) {
        throw new RowError('PROVIDER_CONFLICT', 'Product belongs to another provider');
      }
      const hasChanges = Object.entries(data).some(([key, value]) => {
        const current = (op.existing as any)[key];
        if (Array.isArray(value)) {
          return JSON.stringify(current ?? []) !== JSON.stringify(value);
        }
        return current !== value;
      });
      if (!hasChanges && !hasOptionGroup) {
        return { status: 'skipped' as const, productId: op.existing.id };
      }
      if (dryRun) {
        return { status: 'updated' as const, productId: op.existing.id };
      }
      let updated = op.existing;
      if (hasChanges) {
        updated = await this.prisma.product.update({
          where: { id: op.existing.id },
          data: data as Prisma.ProductUncheckedUpdateInput,
        });
        await this.ensureDefaultBranchProduct(updated.id, updated.providerId);
        if (op.values.stock !== undefined && op.existing.stock !== op.values.stock) {
          await this.recordStockChange(op.existing.id, op.existing.stock, op.values.stock, 'bulk.upload');
        }
      }
      if (optionGroup) {
        await this.applyOptionGroup(updated.id, optionGroup);
      }
      return { status: 'updated' as const, productId: updated.id };
    }

    if (dryRun) {
      return { status: 'created' as const };
    }
    const created = await this.prisma.product.create({ data: data as Prisma.ProductUncheckedCreateInput });
    await this.ensureDefaultBranchProduct(created.id, created.providerId);
    if (optionGroup) {
      await this.applyOptionGroup(created.id, optionGroup);
    }
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

  private async buildCategoryMap(rows: ParsedRow[], providerByRow: Map<number, string | undefined>) {
    const slugsByProvider = new Map<string, Set<string>>();
    for (const row of rows) {
      const rowProviderId = providerByRow.get(row.rowNumber);
      const categorySlug = row.values.categorySlug?.toString().trim().toLowerCase();
      if (!categorySlug || !rowProviderId) continue;
      const existing = slugsByProvider.get(rowProviderId) ?? new Set<string>();
      existing.add(categorySlug);
      slugsByProvider.set(rowProviderId, existing);
    }

    if (!slugsByProvider.size) return new Map<string, string>();

    const filters = Array.from(slugsByProvider.entries()).map(([providerKey, slugs]) => ({
      providerId: providerKey,
      slug: { in: Array.from(slugs) },
      deletedAt: null,
    }));

    const categories = await this.prisma.category.findMany({
      where: { OR: filters },
      select: { id: true, slug: true, providerId: true },
    });

    const map = new Map<string, string>();
    categories.forEach((category) => {
      if (!category.providerId) return;
      map.set(this.categoryKey(category.providerId, category.slug.toLowerCase()), category.id);
    });
    return map;
  }

  private async resolveExistingProduct(
    values: ProductWriteValues,
    slugMap: Map<string, Product>,
    skuMap: Map<string, Product>,
    providerId?: string,
  ): Promise<Product | null> {
    if (values.slug && slugMap.has(values.slug)) {
      const existing = slugMap.get(values.slug)!;
      if (providerId && existing.providerId !== providerId) {
        throw new RowError('PROVIDER_CONFLICT', `Slug "${values.slug}" is already used by another provider`);
      }
      return existing;
    }
    if (values.sku && skuMap.has(values.sku)) {
      const existing = skuMap.get(values.sku)!;
      if (providerId && existing.providerId !== providerId) {
        throw new RowError('PROVIDER_CONFLICT', `SKU "${values.sku}" is already used by another provider`);
      }
      return existing;
    }
    const where: any = { OR: [] as any[] };
    if (values.slug) where.OR.push({ slug: values.slug });
    if (values.sku) where.OR.push({ sku: values.sku });
    if (!where.OR.length) return null;
    const product = await this.prisma.product.findFirst({ where });
    if (product) {
      if (providerId && product.providerId !== providerId) {
        throw new RowError('PROVIDER_CONFLICT', 'Product belongs to another provider');
      }
      slugMap.set(product.slug, product);
      if (product.sku) skuMap.set(product.sku, product);
    }
    return product;
  }

  private async ensureDefaultBranchProduct(productId: string, providerId?: string | null) {
    if (!providerId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { providerId, status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, isDefault: true },
    });
    if (!branch) {
      this.logger.warn({ msg: 'No active branch found for bulk product', productId, providerId });
      return;
    }
    await this.prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId } },
      update: {},
      create: { branchId: branch.id, productId, isActive: true },
    });
  }

  private async applyOptionGroup(productId: string, optionGroup: OptionGroupWriteValues) {
    const existing = await this.prisma.productOptionGroup.findFirst({
      where: { name: optionGroup.name, products: { some: { id: productId } } },
      select: { id: true, products: { select: { id: true } } },
    });

    const groupData = {
      name: optionGroup.name,
      nameAr: optionGroup.nameAr ?? null,
      type: optionGroup.type,
      priceMode: optionGroup.priceMode,
      minSelected: optionGroup.minSelected ?? 0,
      maxSelected: optionGroup.maxSelected ?? null,
      sortOrder: 0,
      isActive: true,
    };

    if (existing) {
      if (existing.products.length > 1) {
        throw new RowError(
          'OPTION_GROUP_SHARED',
          'Option group is shared by multiple products; cannot update via bulk upload',
        );
      }
      await this.prisma.productOptionGroup.update({
        where: { id: existing.id },
        data: groupData,
      });
      await this.prisma.productOption.deleteMany({ where: { groupId: existing.id } });
      if (optionGroup.options.length) {
        await this.prisma.productOption.createMany({
          data: this.buildOptionRows(existing.id, optionGroup.options),
        });
      }
      return existing.id;
    }

    const created = await this.prisma.productOptionGroup.create({
      data: {
        ...groupData,
        products: { connect: { id: productId } },
      },
    });
    if (optionGroup.options.length) {
      await this.prisma.productOption.createMany({
        data: this.buildOptionRows(created.id, optionGroup.options),
      });
    }
    return created.id;
  }

  private buildOptionRows(groupId: string, options: OptionWriteValues[]) {
    return options.map((option) => ({
      groupId,
      name: option.name,
      nameAr: option.nameAr ?? null,
      priceCents: option.priceCents,
      maxQtyPerOption: option.maxQtyPerOption ?? null,
      sortOrder: option.sortOrder ?? 0,
      isActive: option.isActive,
    }));
  }

  private async mapRowToProduct(row: BulkRow, categoryMap: Map<string, string>, providerId?: string) {
    const name = this.requireString(row.name, 'name');
    const slugValue = this.optionalString(row.slug);
    const skuValue = this.optionalString(row.sku);
    const slug = slugValue ? slugify(slugValue) : undefined;
    const sku = skuValue ? skuValue.toUpperCase() : undefined;
    const priceCents = this.parseMoney(row.price, 'price');
    const salePriceCents = this.optionalMoney(row.salePrice);
    const stock = this.parseInteger(row.stock, 'stock');
    const status = this.parseStatus(row.status);
    const categoryId = await this.resolveCategory(row.categorySlug, categoryMap, providerId);
    const images = this.parseImages(row.images);
    const optionGroup = this.parseOptionGroup(row);
    return {
      slug,
      sku,
      providerId,
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
      optionGroup,
    };
  }

  private parseOptionGroup(row: BulkRow): OptionGroupWriteValues | null {
    const hasAnyGroupValue = [
      row.optionGroupName,
      row.optionGroupNameAr,
      row.optionGroupType,
      row.optionGroupPriceMode,
      row.optionGroupMinSelected,
      row.optionGroupMaxSelected,
      row.optionGroupOptions,
    ].some((value) => this.hasValue(value));
    if (!hasAnyGroupValue) {
      return null;
    }

    const name = this.optionalString(row.optionGroupName);
    if (!name) {
      throw new RowError('VALIDATION_ERROR', 'optionGroupName is required when option group columns are provided');
    }

    const options = this.parseOptionGroupOptions(row.optionGroupOptions);
    if (!options.length) {
      throw new RowError('VALIDATION_ERROR', 'optionGroupOptions is required when optionGroupName is provided');
    }

    const type = this.parseOptionGroupType(row.optionGroupType);
    const priceMode = this.parseOptionGroupPriceMode(row.optionGroupPriceMode);
    const minSelected = this.optionalInt(row.optionGroupMinSelected) ?? 0;
    const maxSelected = this.optionalInt(row.optionGroupMaxSelected);

    this.validateGroupRules(type, minSelected, maxSelected, priceMode);

    return {
      name,
      nameAr: this.optionalString(row.optionGroupNameAr) ?? null,
      type,
      priceMode,
      minSelected,
      maxSelected: maxSelected ?? null,
      options,
    };
  }

  private parseOptionGroupType(value: any): ProductOptionGroupType {
    if (!this.hasValue(value)) {
      return ProductOptionGroupType.SINGLE;
    }
    const normalized = String(value).trim().toUpperCase();
    if (!this.groupTypeSet.has(normalized)) {
      throw new RowError(
        'VALIDATION_ERROR',
        `optionGroupType must be one of: ${Array.from(this.groupTypeSet).join(', ')}`,
      );
    }
    return normalized as ProductOptionGroupType;
  }

  private parseOptionGroupPriceMode(value: any): ProductOptionGroupPriceMode {
    if (!this.hasValue(value)) {
      return ProductOptionGroupPriceMode.ADD;
    }
    const normalized = String(value).trim().toUpperCase();
    if (!this.priceModeSet.has(normalized)) {
      throw new RowError(
        'VALIDATION_ERROR',
        `optionGroupPriceMode must be one of: ${Array.from(this.priceModeSet).join(', ')}`,
      );
    }
    return normalized as ProductOptionGroupPriceMode;
  }

  private parseOptionGroupOptions(value: any): OptionWriteValues[] {
    if (!this.hasValue(value)) return [];
    const raw = String(value).trim();
    if (!raw) return [];

    if (raw.startsWith('[') || raw.startsWith('{')) {
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new RowError('VALIDATION_ERROR', 'optionGroupOptions must be valid JSON or a delimited list');
      }
      const list = Array.isArray(parsed) ? parsed : parsed?.options;
      if (!Array.isArray(list)) {
        throw new RowError('VALIDATION_ERROR', 'optionGroupOptions JSON must be an array');
      }
      return list.map((item, idx) => this.mapOptionObject(item, idx));
    }

    const entries = raw
      .split(/;|\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!entries.length) return [];

    return entries.map((entry, idx) => {
      const parts = entry.split('|').map((part) => part.trim());
      const [name, nameAr, price, maxQty, sortOrder, isActive] = parts;
      if (!name) {
        throw new RowError('VALIDATION_ERROR', `optionGroupOptions entry ${idx + 1} is missing a name`);
      }
      return {
        name,
        nameAr: nameAr || null,
        priceCents: this.parseOptionMoney(price),
        maxQtyPerOption: this.optionalInt(maxQty),
        sortOrder: this.optionalInt(sortOrder) ?? idx,
        isActive: this.parseOptionBoolean(isActive),
      };
    });
  }

  private mapOptionObject(value: any, index: number): OptionWriteValues {
    if (!value || typeof value !== 'object') {
      throw new RowError('VALIDATION_ERROR', `optionGroupOptions entry ${index + 1} must be an object`);
    }
    const name = this.requireString(value.name ?? value.optionName ?? value.option, 'optionGroupOptions.name');
    const nameAr = this.optionalString(value.nameAr ?? value.optionNameAr ?? value.option_ar) ?? null;
    const priceValue = value.price ?? value.priceCents ?? value.price_cents ?? 0;
    const maxQty = this.optionalInt(value.maxQtyPerOption ?? value.maxQty ?? value.max_qty_per_option);
    const sortOrder = this.optionalInt(value.sortOrder ?? value.sort_order) ?? index;
    const isActive = this.parseOptionBoolean(value.isActive ?? value.is_active);
    return {
      name,
      nameAr,
      priceCents: this.parseOptionMoney(priceValue),
      maxQtyPerOption: maxQty,
      sortOrder,
      isActive,
    };
  }

  private parseOptionMoney(value: any) {
    if (!this.hasValue(value)) return 0;
    return this.parseMoney(value, 'option price');
  }

  private parseOptionBoolean(value: any) {
    if (!this.hasValue(value)) return true;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }
    throw new RowError('VALIDATION_ERROR', 'optionGroupOptions isActive must be true or false');
  }

  private optionalInt(value: any) {
    if (!this.hasValue(value)) return null;
    const numeric = Number(String(value).trim());
    if (!Number.isFinite(numeric)) {
      throw new RowError('VALIDATION_ERROR', 'Value must be a valid number');
    }
    const intValue = Math.floor(numeric);
    if (intValue < 0) {
      throw new RowError('VALIDATION_ERROR', 'Value must be zero or greater');
    }
    return intValue;
  }

  private validateGroupRules(
    type: ProductOptionGroupType,
    minSelected?: number | null,
    maxSelected?: number | null,
    priceMode: ProductOptionGroupPriceMode = ProductOptionGroupPriceMode.ADD,
  ) {
    const min = minSelected ?? 0;
    const max = maxSelected ?? null;
    if (max !== null && max < min) {
      throw new RowError('VALIDATION_ERROR', 'maxSelected must be greater than or equal to minSelected');
    }
    if (type === ProductOptionGroupType.SINGLE) {
      if (min > 1) {
        throw new RowError('VALIDATION_ERROR', 'Single choice groups cannot require more than one selection');
      }
      if (max !== null && max > 1) {
        throw new RowError('VALIDATION_ERROR', 'Single choice groups cannot allow more than one selection');
      }
    } else if (priceMode === ProductOptionGroupPriceMode.SET) {
      throw new RowError('VALIDATION_ERROR', 'Price override groups must be single choice');
    }
  }

  private async resolveCategory(slugValue: any, categoryMap: Map<string, string>, providerId?: string) {
    if (!this.hasValue(slugValue)) {
      return undefined;
    }
    if (!providerId) {
      throw new RowError('PROVIDER_REQUIRED', 'providerSlug is required to resolve categorySlug');
    }
    const slug = String(slugValue).trim().toLowerCase();
    const id = categoryMap.get(this.categoryKey(providerId, slug));
    if (!id) {
      throw new RowError('CATEGORY_NOT_FOUND', `Category with slug "${slug}" was not found for provider`);
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

  private async buildProviderMap(rows: ParsedRow[]) {
    const slugs = Array.from(
      new Set(
        rows
          .map((row) => row.values.providerSlug?.toString().trim().toLowerCase())
          .filter((slug): slug is string => !!slug),
      ),
    );
    if (!slugs.length) return new Map<string, string>();
    const providers = await this.prisma.provider.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
    return new Map(providers.map((provider) => [provider.slug.toLowerCase(), provider.id]));
  }

  private resolveProviderId(row: BulkRow, providerMap: Map<string, string>, providerScope?: string) {
    const providerSlug = this.optionalString(row.providerSlug);
    if (providerScope) {
      if (!providerSlug) return providerScope;
      const mapped = providerMap.get(providerSlug.toLowerCase());
      if (!mapped) {
        throw new RowError('PROVIDER_NOT_FOUND', `Provider "${providerSlug}" was not found`);
      }
      if (mapped !== providerScope) {
        throw new RowError('PROVIDER_CONFLICT', 'Row provider does not match your provider account');
      }
      return providerScope;
    }
    if (!providerSlug) {
      throw new RowError('PROVIDER_REQUIRED', 'providerSlug is required');
    }
    const providerId = providerMap.get(providerSlug.toLowerCase());
    if (!providerId) {
      throw new RowError('PROVIDER_NOT_FOUND', `Provider "${providerSlug}" was not found`);
    }
    return providerId;
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

  private categoryKey(providerId: string, slug: string) {
    return `${providerId}:${slug}`;
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
