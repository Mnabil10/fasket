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
var UploadsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadsService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const mime_types_1 = require("mime-types");
const crypto_1 = require("crypto");
const uploads_constants_1 = require("./uploads.constants");
const file_type_1 = require("file-type");
const fs = require("fs/promises");
const path = require("path");
const sharpModule = require("sharp");
const uploads_config_1 = require("./uploads.config");
const sharp = (() => {
    const candidate = sharpModule?.default ?? sharpModule;
    if (typeof candidate !== 'function') {
        throw new Error('Sharp module did not export a callable factory');
    }
    return candidate;
})();
function safeFilename(name) {
    const [base, ext = ''] = name.split(/\.(?=[^.]+$)/);
    const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
    return ext ? `${slug}.${ext.toLowerCase()}` : slug;
}
function todayPath() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
let UploadsService = UploadsService_1 = class UploadsService {
    constructor(s3) {
        this.s3 = s3;
        this.logger = new common_1.Logger(UploadsService_1.name);
        this.originalDriver = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();
        this.driver = this.originalDriver;
        this.bucket = process.env.S3_BUCKET;
        this.publicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
        this.localBaseUrl = (0, uploads_config_1.getLocalUploadsBaseUrl)();
        this.localPathPrefix = (0, uploads_config_1.getLocalUploadsPathPrefix)();
        this.localRoot = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
        this.ttl = Number(process.env.UPLOAD_PRESIGN_TTL || 300);
        this.allowed = new Set(String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean));
        this.maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
        this.sse = process.env.S3_SSE || undefined;
        this.allowLocalFallback = (process.env.UPLOADS_ALLOW_LOCAL_FALLBACK ??
            (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';
    }
    resetDriver() {
        this.driver = this.originalDriver;
    }
    mapS3Error(err) {
        console.error('[S3 ERROR]', err);
        const code = err?.name || err?.Code || err?.code;
        const message = err?.message || 'S3 error';
        const rawBody = err?.$response?.body?.toString?.();
        if (rawBody && /<html/i.test(rawBody)) {
            throw new common_1.BadRequestException('The S3 endpoint returned HTML, not XML. Check S3 configuration.');
        }
        if (code === 'NoSuchBucket')
            throw new common_1.BadRequestException('S3 bucket not found');
        if (['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code)) {
            throw new common_1.BadRequestException('S3 access denied or credentials invalid.');
        }
        throw new common_1.InternalServerErrorException(message);
    }
    validateMime(contentType) {
        if (!this.allowed.has(contentType))
            throw new common_1.BadRequestException(`Unsupported content type: ${contentType}`);
    }
    async ensureLocalDir(dir) {
        await fs.mkdir(dir, { recursive: true });
    }
    shouldFallbackToLocal(err) {
        const code = err?.name || err?.Code || err?.code;
        return this.allowLocalFallback && ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code);
    }
    enableLocalFallback(err) {
        if (!this.shouldFallbackToLocal(err) || this.driver === 'local')
            return false;
        const code = err?.name || err?.Code || err?.code || 'Unknown';
        this.logger.warn(`Uploads driver switching to local storage due to S3 error: ${code}`);
        this.driver = 'local';
        return true;
    }
    buildKey(filename, folder = 'products') {
        const clean = safeFilename(filename || 'file');
        return `${folder}/${todayPath()}/${(0, crypto_1.randomUUID)()}-${clean}`;
    }
    publicUrl(key) {
        if (this.driver === 'local') {
            return this.joinLocalUrl(key);
        }
        if (this.driver === 'inline') {
            return key;
        }
        return this.publicBase ? `${this.publicBase}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    joinLocalUrl(key) {
        const cleaned = key.replace(/^\/+/, '');
        const base = this.localBaseUrl.endsWith('/') ? this.localBaseUrl : `${this.localBaseUrl}/`;
        return `${base}${cleaned}`;
    }
    async detectMime(file) {
        const detected = await (0, file_type_1.fileTypeFromBuffer)(file.buffer).catch(() => undefined);
        const mime = detected?.mime || file.mimetype || ((0, mime_types_1.lookup)(file.originalname) || 'application/octet-stream');
        this.validateMime(String(mime));
        return String(mime);
    }
    async storeBuffer(key, buffer, contentType) {
        const warnings = [];
        if (this.driver === 'local') {
            const stored = await this.storeBufferLocally(key, buffer);
            return { ...stored, driver: this.driver, warnings };
        }
        if (this.driver === 'inline') {
            const b64 = buffer.toString('base64');
            return { url: `data:${contentType};base64,${b64}`, driver: this.driver, warnings };
        }
        try {
            await this.s3.send(new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
            }));
            return { url: this.publicUrl(key), driver: this.driver, warnings };
        }
        catch (err) {
            if (this.enableLocalFallback(err)) {
                warnings.push('Uploads driver fell back to local storage due to S3 error.');
                const stored = await this.storeBufferLocally(key, buffer);
                return { ...stored, driver: this.driver, warnings };
            }
            return this.mapS3Error(err);
        }
    }
    async storeBufferLocally(key, buffer) {
        const fullPath = path.join(this.localRoot, key);
        await this.ensureLocalDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, buffer);
        return { url: this.publicUrl(key) };
    }
    async deleteKey(key) {
        if (!key)
            return;
        if (this.originalDriver === 's3') {
            try {
                await this.s3.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }));
                return;
            }
            catch (err) {
                this.enableLocalFallback(err);
            }
        }
        if (this.driver === 'local' || this.originalDriver === 'local') {
            try {
                await fs.unlink(path.join(this.localRoot, key));
            }
            catch {
            }
            return;
        }
    }
    extractKeyFromUrl(url) {
        if (!url)
            return null;
        if (url.startsWith('data:'))
            return null;
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
        if (this.driver === 'inline')
            return null;
        return normalized.replace(/^\/+/, '');
    }
    deriveVariantKeys(key) {
        const ext = path.extname(key) || '';
        const base = key.slice(0, ext.length ? -ext.length : undefined);
        return Array.from(new Set([`${base}${ext}`, `${base}-md${ext}`, `${base}-sm${ext}`]));
    }
    async deleteUrls(urls) {
        const keys = urls
            .map((url) => this.extractKeyFromUrl(url))
            .filter((key) => !!key)
            .flatMap((key) => this.deriveVariantKeys(key));
        const uniqueKeys = Array.from(new Set(keys));
        await Promise.all(uniqueKeys.map((key) => this.deleteKey(key)));
    }
    async optimizeImage(buffer) {
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
        this.resetDriver();
        if (this.driver === 'local') {
            try {
                await this.ensureLocalDir(this.localRoot);
                return { ok: true };
            }
            catch {
                throw new common_1.InternalServerErrorException('Failed to access local uploads directory');
            }
        }
        if (this.driver === 'inline') {
            return { ok: true };
        }
        try {
            await this.s3.send(new client_s3_1.HeadBucketCommand({ Bucket: this.bucket }));
            return { ok: true };
        }
        catch (err) {
            return this.mapS3Error(err);
        }
    }
    async createSignedUrl(params) {
        this.resetDriver();
        this.validateMime(params.contentType);
        const Key = this.buildKey(params.filename, params.folder);
        const warnings = [];
        if (this.driver === 'local') {
            const warning = 'Presigned URLs are disabled because uploads are configured for local storage.';
            this.logger.warn(warning);
            warnings.push(warning);
            return { uploadUrl: null, publicUrl: this.publicUrl(Key), driver: this.driver, warnings, key: Key };
        }
        if (this.driver === 'inline') {
            const warning = 'Inline uploads do not support presigned URLs; send the file contents directly.';
            warnings.push(warning);
            return { uploadUrl: null, publicUrl: this.publicUrl(Key), driver: this.driver, warnings, key: Key };
        }
        try {
            const cmd = new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key,
                ContentType: params.contentType,
                ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
            });
            const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: this.ttl });
            return { uploadUrl, publicUrl: this.publicUrl(Key), driver: this.driver, warnings, key: Key };
        }
        catch (err) {
            if (this.enableLocalFallback(err)) {
                const warning = 'Presign failed against S3; falling back to local driver.';
                this.logger.warn(warning);
                warnings.push(warning);
                return { uploadUrl: null, publicUrl: this.publicUrl(Key), driver: this.driver, warnings, key: Key };
            }
            return this.mapS3Error(err);
        }
    }
    async uploadBuffer(file) {
        return this.processImageAsset(file, { folder: 'misc', generateVariants: false });
    }
    async processProductImage(file, existing) {
        return this.processImageAsset(file, { folder: 'products', generateVariants: true, existing });
    }
    async processImageAsset(file, options = {}) {
        this.resetDriver();
        if (!file)
            throw new common_1.BadRequestException('File is required');
        if (file.size > this.maxBytes)
            throw new common_1.BadRequestException('File too large');
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
            variants: [medium?.url, thumb?.url].filter((url) => !!url),
            driver: primary.driver,
            warnings: [...(primary.warnings ?? []), ...(medium?.warnings ?? []), ...(thumb?.warnings ?? [])].filter((w) => !!w),
        };
    }
};
exports.UploadsService = UploadsService;
exports.UploadsService = UploadsService = UploadsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(uploads_constants_1.S3_CLIENT)),
    __metadata("design:paramtypes", [client_s3_1.S3Client])
], UploadsService);
//# sourceMappingURL=uploads.service.js.map