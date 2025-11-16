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
exports.UploadsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const uploads_service_1 = require("./uploads.service");
const _admin_guards_1 = require("../admin/_admin-guards");
let UploadsController = class UploadsController {
    constructor(uploads) {
        this.uploads = uploads;
    }
    health() {
        return this.uploads.checkHealth();
    }
    async signedUrl(filename, contentType) {
        if (!filename || !contentType)
            throw new common_1.BadRequestException('filename and contentType are required');
        return this.uploads.createSignedUrl({ filename, contentType });
    }
    async multipart(file) {
        return this.uploads.uploadBuffer(file);
    }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOkResponse)({ description: 'Checks S3 bucket accessibility' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('signed-url'),
    (0, swagger_1.ApiQuery)({ name: 'filename', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'contentType', required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] }),
    (0, swagger_1.ApiOkResponse)({ description: 'Returns presigned PUT URL and final public URL' }),
    __param(0, (0, common_1.Query)('filename')),
    __param(1, (0, common_1.Query)('contentType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "signedUrl", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
            required: ['file'],
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
        fileFilter: (req, file, cb) => {
            const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
                .split(',').map(s => s.trim());
            if (!allowed.includes(file.mimetype))
                return cb(new common_1.BadRequestException('Unsupported content type'), false);
            cb(null, true);
        },
    })),
    (0, swagger_1.ApiOkResponse)({ description: 'Uploads a file and returns its public URL' }),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
            new common_1.FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ })
        ],
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "multipart", null);
exports.UploadsController = UploadsController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Uploads'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/uploads', version: ['1'] }),
    __metadata("design:paramtypes", [uploads_service_1.UploadsService])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map