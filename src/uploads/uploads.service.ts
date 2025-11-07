import { Inject, Injectable, BadRequestException, InternalServerErrorException, Optional } from '@nestjs/common';
import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { lookup as mimeLookup } from 'mime-types';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import { S3_CLIENT } from './uploads.constants';
import { fileTypeFromBuffer } from 'file-type';
import * as fs from 'fs/promises';
import * as path from 'path';

function safeFilename(name: string) {
  const [base, ext = ''] = name.split(/\.(?=[^\.]+$)/);
  const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
  return ext ? `${slug}.${ext.toLowerCase()}` : slug;
}
function todayPath() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class UploadsService {
  private readonly driver = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();
  private readonly bucket = process.env.S3_BUCKET!;
  private readonly publicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  private readonly localBase = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');
  private readonly localRoot = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
  private readonly ttl = Number(process.env.UPLOAD_PRESIGN_TTL || 300);
  private readonly allowed = new Set(
    String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
      .split(',').map(s => s.trim()).filter(Boolean),
  );
  private readonly maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  private readonly sse = process.env.S3_SSE || undefined;

  constructor(@Inject(S3_CLIENT) private readonly s3: S3Client) {}  // ⬅️ inject string token

  private mapS3Error(err: any): never {
    // eslint-disable-next-line no-console
    console.error('[S3 ERROR]', err);
    const code = err?.name || err?.Code || err?.code;
    const message = err?.message || 'S3 error';
    const rawBody = (err as any)?.$response?.body?.toString?.();
    if (rawBody && /<html/i.test(rawBody)) {
      throw new BadRequestException('The S3 endpoint returned HTML, not XML. Check S3_ENDPOINT/region/credentials.');
    }
    if (code === 'NoSuchBucket') throw new BadRequestException('S3 bucket not found');
    if (code === 'AccessDenied' || code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') {
      throw new BadRequestException('S3 access denied or credentials invalid. Verify keys, region, and endpoint.');
    }
    throw new InternalServerErrorException(message);
  }

  private validateMime(contentType: string) {
    if (!this.allowed.has(contentType)) throw new BadRequestException(`Unsupported content type: ${contentType}`);
  }
  private buildKey(filename: string) {
    const clean = safeFilename(filename || 'file');
    return `products/${todayPath()}/${randomUUID()}-${clean}`;
  }
  private publicUrl(key: string) {
    if (this.driver === 'local') {
      return `${this.localBase}/${key}`;
    }
    return this.publicBase ? `${this.publicBase}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
  private async ensureLocalDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
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

  async createSignedUrl(params: { filename: string; contentType: string }) {
    if (this.driver === 'local' || this.driver === 'inline') {
      throw new BadRequestException('Presigned URL not supported for local storage');
    }
    this.validateMime(params.contentType);
    const Key = this.buildKey(params.filename);
    try {
      const cmd = new PutObjectCommand({ Bucket: this.bucket, Key, ContentType: params.contentType, ...(this.sse ? { ServerSideEncryption: this.sse as any } : {}) });
      const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
      return { uploadUrl, publicUrl: this.publicUrl(Key) };
    } catch (err) {
      return this.mapS3Error(err);
    }
  }

  async uploadBuffer(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > this.maxBytes) throw new BadRequestException('File too large');
    const detected = await fileTypeFromBuffer(file.buffer).catch(() => undefined);
    const mime = (detected?.mime) || file.mimetype || (mimeLookup(file.originalname) || 'application/octet-stream');
    this.validateMime(String(mime));
    const Key = this.buildKey(file.originalname);
    if (this.driver === 'local') {
      const fullPath = path.join(this.localRoot, Key);
      await this.ensureLocalDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, file.buffer);
      return { url: this.publicUrl(Key) };
    }
    if (this.driver === 'inline') {
      const b64 = file.buffer.toString('base64');
      const url = `data:${String(mime)};base64,${b64}`;
      return { url };
    }
    try {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key, Body: file.buffer, ContentType: String(mime), ...(this.sse ? { ServerSideEncryption: this.sse as any } : {}) }));
      return { url: this.publicUrl(Key) };
    } catch (err) {
      return this.mapS3Error(err);
    }
  }
}
