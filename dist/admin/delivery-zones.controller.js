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
exports.AdminDeliveryZonesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const settings_service_1 = require("../settings/settings.service");
const delivery_zone_dto_1 = require("./dto/delivery-zone.dto");
const errors_1 = require("../common/errors");
let AdminDeliveryZonesController = class AdminDeliveryZonesController {
    constructor(settings) {
        this.settings = settings;
    }
    list(query) {
        return this.settings.listZones({
            search: query.search?.trim() || undefined,
            isActive: query.isActive,
            page: query.page,
            pageSize: query.pageSize,
        });
    }
    async get(id) {
        const zone = await this.settings.getZoneById(id, { includeInactive: true });
        if (!zone) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found');
        }
        return zone;
    }
    create(dto) {
        return this.settings.createZone({
            nameEn: dto.nameEn,
            nameAr: dto.nameAr,
            city: dto.city,
            region: dto.region,
            feeCents: dto.feeCents,
            etaMinutes: dto.etaMinutes,
            freeDeliveryThresholdCents: dto.freeDeliveryThresholdCents,
            minOrderAmountCents: dto.minOrderAmountCents,
            isActive: dto.isActive,
        });
    }
    update(id, dto) {
        return this.settings.updateZone(id, {
            nameEn: dto.nameEn,
            nameAr: dto.nameAr,
            city: dto.city,
            region: dto.region,
            feeCents: dto.feeCents,
            etaMinutes: dto.etaMinutes,
            freeDeliveryThresholdCents: dto.freeDeliveryThresholdCents,
            minOrderAmountCents: dto.minOrderAmountCents,
            isActive: dto.isActive,
        });
    }
    async delete(id) {
        await this.settings.deleteZone(id);
        return { success: true };
    }
};
exports.AdminDeliveryZonesController = AdminDeliveryZonesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, type: Boolean }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delivery_zone_dto_1.ListDeliveryZonesQueryDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryZonesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminDeliveryZonesController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delivery_zone_dto_1.CreateDeliveryZoneDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryZonesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, delivery_zone_dto_1.UpdateDeliveryZoneDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryZonesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminDeliveryZonesController.prototype, "delete", null);
exports.AdminDeliveryZonesController = AdminDeliveryZonesController = __decorate([
    (0, swagger_1.ApiTags)('Admin/DeliveryZones'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/settings/zones', version: ['1'] }),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], AdminDeliveryZonesController);
//# sourceMappingURL=delivery-zones.controller.js.map