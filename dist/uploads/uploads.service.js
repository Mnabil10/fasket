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
function safeFilename(name) {
    const [base, ext = ''] = name.split(/\.(?=[^\.]+$)/);
    const slug = base.toLowerCase().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 64);
    return ext ? `${slug}.${ext.toLowerCase()}` : slug;
}
function todayPath() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
let UploadsService = class UploadsService {
    constructor(s3) {
        this.s3 = s3;
        this.driver = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();
        this.bucket = process.env.S3_BUCKET;
        this.publicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
        this.localBase = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');
        this.localRoot = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
        this.ttl = Number(process.env.UPLOAD_PRESIGN_TTL || 300);
        this.allowed = new Set(String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
            .split(',').map(s => s.trim()).filter(Boolean));
        this.maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
        this.sse = process.env.S3_SSE || undefined;
    }
    mapS3Error(err) {
        console.error('[S3 ERROR]', err);
        const code = err?.name || err?.Code || err?.code;
        const message = err?.message || 'S3 error';
        const rawBody = err?.$response?.body?.toString?.();
        if (rawBody && /<html/i.test(rawBody)) {
            throw new common_1.BadRequestException('The S3 endpoint returned HTML, not XML. Check S3_ENDPOINT/region/credentials.');
        }
        if (code === 'NoSuchBucket')
            throw new common_1.BadRequestException('S3 bucket not found');
        if (code === 'AccessDenied' || code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') {
            throw new common_1.BadRequestException('S3 access denied or credentials invalid. Verify keys, region, and endpoint.');
        }
        throw new common_1.InternalServerErrorException(message);
    }
    validateMime(contentType) {
        if (!this.allowed.has(contentType))
            throw new common_1.BadRequestException(`Unsupported content type: ${contentType}`);
    }
    buildKey(filename) {
        const clean = safeFilename(filename || 'file');
        return `products/${todayPath()}/${(0, crypto_1.randomUUID)()}-${clean}`;
    }
    publicUrl(key) {
        if (this.driver === 'local') {
            return `${this.localBase}/${key}`;
        }
        return this.publicBase ? `${this.publicBase}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    async ensureLocalDir(dir) {
        await fs.mkdir(dir, { recursive: true });
    }
    async checkHealth() {
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
        if (this.driver === 'local' || this.driver === 'inline') {
            throw new common_1.BadRequestException('Presigned URL not supported for local storage');
        }
        this.validateMime(params.contentType);
        const Key = this.buildKey(params.filename);
        try {
            const cmd = new client_s3_1.PutObjectCommand({ Bucket: this.bucket, Key, ContentType: params.contentType, ...(this.sse ? { ServerSideEncryption: this.sse } : {}) });
            const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: this.ttl });
            return { uploadUrl, publicUrl: this.publicUrl(Key) };
        }
        catch (err) {
            return this.mapS3Error(err);
        }
    }
    async uploadBuffer(file) {
        if (!file)
            throw new common_1.BadRequestException('File is required');
        if (file.size > this.maxBytes)
            throw new common_1.BadRequestException('File too large');
        const detected = await (0, file_type_1.fileTypeFromBuffer)(file.buffer).catch(() => undefined);
        const mime = (detected?.mime) || file.mimetype || ((0, mime_types_1.lookup)(file.originalname) || 'application/octet-stream');
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
            await this.s3.send(new client_s3_1.PutObjectCommand({ Bucket: this.bucket, Key, Body: file.buffer, ContentType: String(mime), ...(this.sse ? { ServerSideEncryption: this.sse } : {}) }));
            return { url: this.publicUrl(Key) };
        }
        catch (err) {
            return this.mapS3Error(err);
        }
    }
};
exports.UploadsService = UploadsService;
exports.UploadsService = UploadsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(uploads_constants_1.S3_CLIENT)),
    __metadata("design:paramtypes", [client_s3_1.S3Client])
], UploadsService);
//# sourceMappingURL=uploads.service.js.map