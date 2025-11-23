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
exports.AdminDeliveryDriversController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const _admin_guards_1 = require("./_admin-guards");
const delivery_drivers_service_1 = require("../delivery-drivers/delivery-drivers.service");
const driver_dto_1 = require("../delivery-drivers/dto/driver.dto");
const uploads_service_1 = require("../uploads/uploads.service");
let AdminDeliveryDriversController = class AdminDeliveryDriversController {
    constructor(drivers, uploads) {
        this.drivers = drivers;
        this.uploads = uploads;
    }
    list(search, isActive, page, pageSize) {
        return this.drivers.list({
            search,
            isActive: isActive === undefined ? undefined : isActive === 'true',
            page,
            pageSize,
        });
    }
    get(id) {
        return this.drivers.getById(id);
    }
    async create(body, files) {
        const payload = this.normalizeCreatePayload(body);
        const nationalIdFile = this.pickFirst(files?.nationalIdImage);
        const vehicleLicenseFile = this.pickFirst(files?.['vehicle.licenseImage']) ?? this.pickFirst(files?.vehicleLicenseImage);
        if (nationalIdFile) {
            this.ensureFileAllowed(nationalIdFile);
            const uploaded = await this.uploads.processImageAsset(nationalIdFile, {
                folder: 'drivers',
                generateVariants: false,
            });
            payload.nationalIdImageUrl = uploaded.url;
        }
        if (vehicleLicenseFile) {
            this.ensureFileAllowed(vehicleLicenseFile);
            const uploaded = await this.uploads.processImageAsset(vehicleLicenseFile, {
                folder: 'drivers',
                generateVariants: false,
            });
            payload.vehicle = payload.vehicle ?? {};
            payload.vehicle.licenseImageUrl = uploaded.url;
        }
        const dto = await this.validateCreateDto(payload);
        return this.drivers.create(dto);
    }
    update(id, dto) {
        return this.drivers.update(id, dto);
    }
    updateStatus(id, dto) {
        return this.drivers.updateStatus(id, dto);
    }
    upsertVehicle(id, dto) {
        return this.drivers.upsertVehicle(id, dto);
    }
    normalizeCreatePayload(body) {
        const vehicle = this.extractVehicle(body);
        return {
            fullName: body.fullName,
            phone: body.phone,
            nationalId: body.nationalId,
            nationalIdImageUrl: body.nationalIdImageUrl,
            isActive: body.isActive,
            ...(vehicle ? { vehicle } : {}),
        };
    }
    extractVehicle(body) {
        const type = body['vehicle.type'] ?? body.vehicleType ?? body?.vehicle?.type;
        const plateNumber = body['vehicle.plateNumber'] ?? body.vehiclePlateNumber ?? body?.vehicle?.plateNumber;
        const color = body['vehicle.color'] ?? body.vehicleColor ?? body?.vehicle?.color;
        const licenseImageUrl = body['vehicle.licenseImageUrl'] ??
            body.vehicleLicenseImageUrl ??
            body?.vehicle?.licenseImageUrl;
        if ([type, plateNumber, color, licenseImageUrl].every((v) => v === undefined))
            return undefined;
        return { type, plateNumber, color, licenseImageUrl };
    }
    pickFirst(files) {
        return Array.isArray(files) && files.length ? files[0] : undefined;
    }
    ensureFileAllowed(file) {
        const maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
        if (!file?.buffer?.length) {
            throw new common_1.BadRequestException('File is empty');
        }
        if (file.size > maxBytes) {
            throw new common_1.BadRequestException(`File too large (max ${maxBytes} bytes)`);
        }
        const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
            .split(',')
            .map((s) => s.trim());
        if (!allowed.includes(file.mimetype)) {
            throw new common_1.BadRequestException('Unsupported content type');
        }
    }
    async validateCreateDto(payload) {
        const dto = (0, class_transformer_1.plainToInstance)(driver_dto_1.CreateDriverDto, payload, { enableImplicitConversion: true });
        try {
            await (0, class_validator_1.validateOrReject)(dto, { whitelist: true, forbidNonWhitelisted: true });
            return dto;
        }
        catch (error) {
            throw new common_1.BadRequestException(error);
        }
    }
};
exports.AdminDeliveryDriversController = AdminDeliveryDriversController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number }),
    __param(0, (0, common_1.Query)('search')),
    __param(1, (0, common_1.Query)('isActive')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['fullName', 'phone', 'nationalId'],
            properties: {
                fullName: { type: 'string' },
                phone: { type: 'string' },
                nationalId: { type: 'string' },
                isActive: { type: 'boolean' },
                nationalIdImage: { type: 'string', format: 'binary' },
                'vehicle.type': { type: 'string' },
                'vehicle.plateNumber': { type: 'string' },
                'vehicle.color': { type: 'string' },
                'vehicle.licenseImage': { type: 'string', format: 'binary' },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'nationalIdImage', maxCount: 1 },
        { name: 'vehicle.licenseImage', maxCount: 1 },
        { name: 'vehicleLicenseImage', maxCount: 1 },
    ], {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
        fileFilter: (_req, file, cb) => {
            const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
                .split(',')
                .map((s) => s.trim());
            if (file && !allowed.includes(file.mimetype)) {
                return cb(new common_1.BadRequestException('Unsupported content type'), false);
            }
            cb(null, true);
        },
    })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminDeliveryDriversController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpdateDriverDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpdateDriverStatusDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/vehicle'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpsertVehicleDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "upsertVehicle", null);
exports.AdminDeliveryDriversController = AdminDeliveryDriversController = __decorate([
    (0, swagger_1.ApiTags)('Admin/DeliveryDrivers'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/delivery-drivers', version: ['1'] }),
    __metadata("design:paramtypes", [delivery_drivers_service_1.DeliveryDriversService,
        uploads_service_1.UploadsService])
], AdminDeliveryDriversController);
//# sourceMappingURL=delivery-drivers.controller.js.map