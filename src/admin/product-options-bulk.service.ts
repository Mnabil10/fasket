import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Express } from 'express';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';

const TEMPLATE_HEADERS = [
  'optionId',
  'name',
  'nameAr',
  'price',
  'maxQtyPerOption',
  'sortOrder',
  'isActive',
] as const;

type HeaderKey = (typeof TEMPLATE_HEADERS)[number];
type BulkRow = Record<HeaderKey, any>;

interface ParsedRow {
  rowNumber: number;
  values: BulkRow;
}

interface OptionWriteValues {
  optionId?: string;
  name: string;
  nameAr?: string | null;
  priceCents: number;
  maxQtyPerOption?: number | null;
  sortOrder: number;
  isActive: boolean;
}

interface ValidatedRow {
  rowNumber: number;
  values: OptionWriteValues;
}

interface PreparedOperation {
  rowNumber: number;
  values: OptionWriteValues;
  action: 'create' | 'update';
  existing?: {
    id: string;
    name: string;
    nameAr: string | null;
    priceCents: number;
    maxQtyPerOption: number | null;
    sortOrder: number;
    isActive: boolean;
    groupId: string;
  };
}

export interface RowResult {
  rowNumber: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  optionId?: string;
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
export class ProductOptionsBulkService {
  private readonly batchSize = Number(process.env.BULK_PRODUCT_OPTIONS_BATCH_SIZE || 50);

  constructor(private readonly prisma: PrismaService) {}

  generateTemplate(): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Options');
    const binary = XLSX.write(workbook, { type: 'binary', bookType: 'xlsx' });
    return Buffer.from(binary, 'binary');
  }

  async processUpload(
    file: Express.Multer.File,
    groupId: string,
    options: { dryRun?: boolean } = {},
  ): Promise<BulkUploadResult> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const group = await this.prisma.productOptionGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) throw new NotFoundException('Option group not found');

    const rows = this.extractRows(file);
    if (!rows.length) {
      throw new BadRequestException('No option rows were found in the file');
    }

    const result: BulkUploadResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      rows: [],
      dryRun: !!options.dryRun,
    };

    const parsedRows: ValidatedRow[] = [];
    for (const row of rows) {
      try {
        const values = this.mapRowToOption(row.values);
        parsedRows.push({ rowNumber: row.rowNumber, values });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code = error instanceof RowError ? error.code : 'ROW_ERROR';
        result.errors.push({ row: row.rowNumber, code, message });
        result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
      }
    }

    const operations: PreparedOperation[] = [];
    const rowKeys = new Set<string>();
    for (const row of parsedRows) {
      try {
        const values = { ...row.values };
        const dedupeKey = values.optionId ?? `${values.name}:${values.nameAr ?? ''}`;
        if (rowKeys.has(dedupeKey)) {
          throw new RowError('DUPLICATE_ROW', 'Duplicate option in file. Row skipped.');
        }
        rowKeys.add(dedupeKey);

        if (values.optionId) {
          const existing = await this.prisma.productOption.findUnique({
            where: { id: values.optionId },
            select: {
              id: true,
              name: true,
              nameAr: true,
              priceCents: true,
              maxQtyPerOption: true,
              sortOrder: true,
              isActive: true,
              groupId: true,
            },
          });
          if (!existing) {
            throw new RowError('OPTION_NOT_FOUND', `Option "${values.optionId}" was not found`);
          }
          if (existing.groupId !== groupId) {
            throw new RowError('GROUP_MISMATCH', 'Option does not belong to this group');
          }
          operations.push({ rowNumber: row.rowNumber, values, action: 'update', existing });
        } else {
          operations.push({ rowNumber: row.rowNumber, values, action: 'create' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code = error instanceof RowError ? error.code : 'ROW_ERROR';
        result.errors.push({ row: row.rowNumber, code, message });
        result.rows.push({ rowNumber: row.rowNumber, status: 'error', errorMessage: message, errorCode: code });
      }
    }

    for (let i = 0; i < operations.length; i += this.batchSize) {
      const batch = operations.slice(i, i + this.batchSize);
      const outcomes = await Promise.allSettled(batch.map((op) => this.applyOperation(op, groupId, !!options.dryRun)));
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
          optionId: data.optionId,
          dryRun: options.dryRun,
        });
        if (data.status === 'created') result.created += 1;
        if (data.status === 'updated') result.updated += 1;
        if (data.status === 'skipped') result.skipped += 1;
      });
    }

    return result;
  }

  private async applyOperation(op: PreparedOperation, groupId: string, dryRun: boolean) {
    const data = {
      name: op.values.name,
      nameAr: op.values.nameAr ?? null,
      priceCents: op.values.priceCents,
      maxQtyPerOption: op.values.maxQtyPerOption ?? null,
      sortOrder: op.values.sortOrder ?? 0,
      isActive: op.values.isActive ?? true,
      groupId,
    };

    if (op.action === 'update' && op.existing) {
      const hasChanges = Object.entries(data).some(([key, value]) => {
        const current = (op.existing as any)[key];
        return current !== value;
      });
      if (!hasChanges) {
        return { status: 'skipped' as const, optionId: op.existing.id };
      }
      if (dryRun) {
        return { status: 'updated' as const, optionId: op.existing.id };
      }
      const updated = await this.prisma.productOption.update({
        where: { id: op.existing.id },
        data,
      });
      return { status: 'updated' as const, optionId: updated.id };
    }

    if (dryRun) {
      return { status: 'created' as const };
    }
    const created = await this.prisma.productOption.create({ data });
    return { status: 'created' as const, optionId: created.id };
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

  private mapRowToOption(row: BulkRow): OptionWriteValues {
    const optionId = this.optionalString(row.optionId);
    const name = this.requireString(row.name, 'name');
    const priceCents = this.optionalMoney(row.price) ?? 0;
    const maxQtyPerOption = this.optionalInt(row.maxQtyPerOption);
    const sortOrder = this.optionalInt(row.sortOrder) ?? 0;
    const isActive = this.parseBoolean(row.isActive);
    return {
      optionId,
      name,
      nameAr: this.optionalString(row.nameAr),
      priceCents,
      maxQtyPerOption,
      sortOrder,
      isActive,
    };
  }

  private parseBoolean(value: any) {
    if (!this.hasValue(value)) return true;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
    throw new RowError('VALIDATION_ERROR', 'isActive must be true or false');
  }

  private optionalMoney(value: any) {
    if (!this.hasValue(value)) return null;
    return this.parseMoney(value, 'price');
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

  private optionalString(value: any) {
    return this.hasValue(value) ? String(value).trim() : undefined;
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
}
