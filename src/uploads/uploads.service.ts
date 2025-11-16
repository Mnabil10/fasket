import {
  Inject,
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { lookup as mimeLookup } from 'mime-types';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import { S3_CLIENT } from './uploads.constants';
import { fileTypeFromBuffer } from 'file-type';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sharpModule from 'sharp';
import { getLocalUploadsBaseUrl, getLocalUploadsPathPrefix } from './uploads.config';

const sharp: typeof sharpModule = (() => {
  const candidate = (sharpModule as unknown as { default?: typeof sharpModule })?.default ?? (sharpModule as any);
  if (typeof candidate !== 'function') {
    throw new Error('Sharp module did not export a callable factory');
  }
  return candidate;
})();

function safeFilename(name: string) {
  const [base, ext = ''] = name.split(/\.(?=[^.]+$)/);
  const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
  return ext ? `${slug}.${ext.toLowerCase()}` : slug;
}
function todayPath() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export interface ProcessedImageResult {
  url: string;
  variants: string[];
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly originalDriver = (process.env.UPLOADS_DRIVER || 's3').toLowerCase() as 's3' | 'local' | 'inline';
  private driver: 's3' | 'local' | 'inline' = this.originalDriver;
  private readonly bucket = process.env.S3_BUCKET!;
  private readonly publicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  private readonly localBaseUrl = getLocalUploadsBaseUrl();
  private readonly localPathPrefix = getLocalUploadsPathPrefix();
  private readonly localRoot = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
  private readonly ttl = Number(process.env.UPLOAD_PRESIGN_TTL || 300);
  private readonly allowed = new Set(
    String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  private readonly maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  private readonly sse = process.env.S3_SSE || undefined;
  private readonly allowLocalFallback =
    (process.env.UPLOADS_ALLOW_LOCAL_FALLBACK ??
      (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';

  constructor(@Inject(S3_CLIENT) private readonly s3: S3Client) {}

  private mapS3Error(err: any): never {
    // eslint-disable-next-line no-console
    console.error('[S3 ERROR]', err);
    const code = err?.name || err?.Code || err?.code;
    const message = err?.message || 'S3 error';
    const rawBody = (err as any)?.$response?.body?.toString?.();
    if (rawBody && /<html/i.test(rawBody)) {
      throw new BadRequestException('The S3 endpoint returned HTML, not XML. Check S3 configuration.');
    }
    if (code === 'NoSuchBucket') throw new BadRequestException('S3 bucket not found');
    if (['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code)) {
      throw new BadRequestException('S3 access denied or credentials invalid.');
    }
    throw new InternalServerErrorException(message);
  }

  private validateMime(contentType: string) {
    if (!this.allowed.has(contentType)) throw new BadRequestException(`Unsupported content type: ${contentType}`);
  }

  private async ensureLocalDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private shouldFallbackToLocal(err: any) {
    const code = err?.name || err?.Code || err?.code;
    return this.allowLocalFallback && ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code);
  }

  private enableLocalFallback(err: any) {
    if (!this.shouldFallbackToLocal(err) || this.driver === 'local') return false;
    const code = err?.name || err?.Code || err?.code || 'Unknown';
    this.logger.warn(`Uploads driver switching to local storage due to S3 error: ${code}`);
    this.driver = 'local';
    return true;
  }

  private buildKey(filename: string, folder = 'products') {
    const clean = safeFilename(filename || 'file');
    return `${folder}/${todayPath()}/${randomUUID()}-${clean}`;
  }

  private publicUrl(key: string) {
    if (this.driver === 'local') {
      return this.joinLocalUrl(key);
    }
    if (this.driver === 'inline') {
      return key;
    }
    return this.publicBase ? `${this.publicBase}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private joinLocalUrl(key: string) {
    const cleaned = key.replace(/^\/+/, '');
    const base = this.localBaseUrl.endsWith('/') ? this.localBaseUrl : `${this.localBaseUrl}/`;
    return `${base}${cleaned}`;
  }

  private async detectMime(file: Express.Multer.File) {
    const detected = await fileTypeFromBuffer(file.buffer).catch(() => undefined);
    const mime = detected?.mime || file.mimetype || (mimeLookup(file.originalname) || 'application/octet-stream');
    this.validateMime(String(mime));
    return String(mime);
  }

  private async storeBuffer(key: string, buffer: Buffer, contentType: string) {
    if (this.driver === 'local') {
      return this.storeBufferLocally(key, buffer);
    }
    if (this.driver === 'inline') {
      const b64 = buffer.toString('base64');
      return { url: `data:${contentType};base64,${b64}` };
    }
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ...(this.sse ? { ServerSideEncryption: this.sse as any } : {}),
        }),
      );
      return { url: this.publicUrl(key) };
    } catch (err) {
      if (this.enableLocalFallback(err)) {
        return this.storeBufferLocally(key, buffer);
      }
      return this.mapS3Error(err);
    }
  }

  private async storeBufferLocally(key: string, buffer: Buffer) {
    const fullPath = path.join(this.localRoot, key);
    await this.ensureLocalDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
    return { url: this.publicUrl(key) };
  }

  private async deleteKey(key: string) {
    if (!key) return;
    if (this.driver === 'local') {
      try {
        await fs.unlink(path.join(this.localRoot, key));
      } catch {
        // ignore missing files
      }
      return;
    }
    if (this.driver === 'inline') return;
    await this.s3
      .send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      .catch((err) => {
        this.enableLocalFallback(err);
        return undefined;
      });
  }

  private extractKeyFromUrl(url?: string | null) {
    if (!url) return null;
    if (url.startsWith('data:')) return null;
    const normalized = url.replace(/\\/g, '/');
    if (normalized.startsWith(this.localBaseUrl + '/')) {
      return normalized.substring(this.localBaseUrl.length + 1);
    }
    if (this.localPathPrefix && normalized.includes(`${this.localPathPrefix}/`)) {
      const idx = normalized.indexOf(`${this.localPathPrefix}/`);
      return normalized.substring(idx + this.localPathPrefix.length + 1);
    }
    const s3Base = this.publicBase || `https://${this.bucket}.s3.amazonaws.com`;
    if (normalized.startsWith(`${s3Base}/`)) {
      return normalized.substring(s3Base.length + 1);
    }
    if (this.driver === 'inline') return null;
    return normalized.replace(/^\/+/, '');
  }

  private async deleteUrls(urls: (string | null | undefined)[]) {
    await Promise.all(
      urls
        .map((url) => this.extractKeyFromUrl(url))
        .filter((key): key is string => !!key)
        .map((key) => this.deleteKey(key)),
    );
  }

  private async optimizeImage(buffer: Buffer) {
    const image = sharp(buffer).rotate();
    const original = await image
      .clone()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    const medium = await image
      .clone()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const thumb = await image
      .clone()
      .resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { original, medium, thumb, mime: 'image/webp' };
  }

  async checkHealth() {
    if (this.driver === 'local') {
      try {
        await this.ensureLocalDir(this.localRoot);
        return { ok: true };
      } catch {
        throw new InternalServerErrorException('Failed to access local uploads directory');
      }
    }
    if (this.driver === 'inline') {
      return { ok: true };
    }
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (err) {
      return this.mapS3Error(err);
    }
  }

  async createSignedUrl(params: { filename: string; contentType: string; folder?: string }) {
    if (this.driver === 'local' || this.driver === 'inline') {
      throw new BadRequestException('Presigned URL not supported for local storage');
    }
    this.validateMime(params.contentType);
    const Key = this.buildKey(params.filename, params.folder);
    try {
      const cmd = new PutObjectCommand({
        Bucket: this.bucket,
        Key,
        ContentType: params.contentType,
        ...(this.sse ? { ServerSideEncryption: this.sse as any } : {}),
      });
      const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
      return { uploadUrl, publicUrl: this.publicUrl(Key) };
    } catch (err) {
      return this.mapS3Error(err);
    }
  }

  async uploadBuffer(file: Express.Multer.File) {
    return this.processImageAsset(file, { folder: 'misc', generateVariants: false });
  }

  async processProductImage(file: Express.Multer.File, existing?: string[]) {
    return this.processImageAsset(file, { folder: 'products', generateVariants: true, existing });
  }

  async processImageAsset(
    file: Express.Multer.File,
    options: { folder?: string; generateVariants?: boolean; existing?: string[] } = {},
  ): Promise<ProcessedImageResult> {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > this.maxBytes) throw new BadRequestException('File too large');
    const mime = await this.detectMime(file);
    await this.deleteUrls(options.existing ?? []);
    const optimized = await this.optimizeImage(file.buffer);
    const folder = options.folder ?? 'products';
    const baseKey = this.buildKey(file.originalname, folder).replace(/\.[^.]+$/, '');
    const originalKey = `${baseKey}.webp`;
    const mediumKey = `${baseKey}-md.webp`;
    const thumbKey = `${baseKey}-sm.webp`;

    const primary = await this.storeBuffer(originalKey, optimized.original, optimized.mime);
    const medium = options.generateVariants === false
      ? null
      : await this.storeBuffer(mediumKey, optimized.medium, optimized.mime);
    const thumb = options.generateVariants === false
      ? null
      : await this.storeBuffer(thumbKey, optimized.thumb, optimized.mime);

    return {
      url: primary.url,
      variants: [medium?.url, thumb?.url].filter((url): url is string => !!url),
    };
  }
}
