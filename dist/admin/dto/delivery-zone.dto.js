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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListDeliveryZonesQueryDto = exports.UpdateDeliveryZoneDto = exports.CreateDeliveryZoneDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const pagination_dto_1 = require("./pagination.dto");
class CreateDeliveryZoneDto {
}
exports.CreateDeliveryZoneDto = CreateDeliveryZoneDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "nameAr", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Delivery fee in cents', minimum: 0 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateDeliveryZoneDto.prototype, "feeCents", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ETA in minutes' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateDeliveryZoneDto.prototype, "etaMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Free delivery threshold in cents' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateDeliveryZoneDto.prototype, "freeDeliveryThresholdCents", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum order allowed in cents' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateDeliveryZoneDto.prototype, "minOrderAmountCents", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateDeliveryZoneDto.prototype, "isActive", void 0);
class UpdateDeliveryZoneDto extends (0, swagger_1.PartialType)(CreateDeliveryZoneDto) {
}
exports.UpdateDeliveryZoneDto = UpdateDeliveryZoneDto;
class ListDeliveryZonesQueryDto extends pagination_dto_1.PaginationDto {
}
exports.ListDeliveryZonesQueryDto = ListDeliveryZonesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListDeliveryZonesQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Boolean }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value === 'boolean')
            return value;
        const normalized = String(value).toLowerCase();
        if (['true', '1', 'yes'].includes(normalized))
            return true;
        if (['false', '0', 'no'].includes(normalized))
            return false;
        return value;
    }),
    __metadata("design:type", Boolean)
], ListDeliveryZonesQueryDto.prototype, "isActive", void 0);
//# sourceMappingURL=delivery-zone.dto.js.map