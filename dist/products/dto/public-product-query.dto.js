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
exports.PublicProductFeedDto = exports.PublicProductListDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
const localize_util_1 = require("../../common/utils/localize.util");
class PublicProductListDto extends pagination_dto_1.PaginationDto {
    constructor() {
        super(...arguments);
        this.orderBy = 'createdAt';
        this.sort = 'desc';
    }
}
exports.PublicProductListDto = PublicProductListDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "categorySlug", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum price (EGP)', type: 'number' }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PublicProductListDto.prototype, "min", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum price (EGP)', type: 'number' }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PublicProductListDto.prototype, "max", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['en', 'ar'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['en', 'ar']),
    (0, class_transformer_1.Transform)(({ value }) => {
        return (0, localize_util_1.normalizeLang)(value);
    }),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "lang", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['createdAt', 'priceCents', 'name'], default: 'createdAt' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['createdAt', 'priceCents', 'name']),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "orderBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['asc', 'desc'], default: 'desc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['asc', 'desc']),
    __metadata("design:type", String)
], PublicProductListDto.prototype, "sort", void 0);
class PublicProductFeedDto extends pagination_dto_1.PaginationDto {
}
exports.PublicProductFeedDto = PublicProductFeedDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['en', 'ar'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['en', 'ar']),
    (0, class_transformer_1.Transform)(({ value }) => {
        return (0, localize_util_1.normalizeLang)(value);
    }),
    __metadata("design:type", String)
], PublicProductFeedDto.prototype, "lang", void 0);
//# sourceMappingURL=public-product-query.dto.js.map