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
exports.PublicCategoryListDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
const localize_util_1 = require("../../common/utils/localize.util");
class PublicCategoryListDto extends pagination_dto_1.PaginationDto {
    constructor() {
        super(...arguments);
        this.sort = 'asc';
    }
}
exports.PublicCategoryListDto = PublicCategoryListDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['en', 'ar'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['en', 'ar']),
    (0, class_transformer_1.Transform)(({ value }) => {
        return (0, localize_util_1.normalizeLang)(value);
    }),
    __metadata("design:type", String)
], PublicCategoryListDto.prototype, "lang", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Search by category name or slug' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublicCategoryListDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['asc', 'desc'], default: 'asc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['asc', 'desc']),
    __metadata("design:type", String)
], PublicCategoryListDto.prototype, "sort", void 0);
//# sourceMappingURL=public-category-query.dto.js.map