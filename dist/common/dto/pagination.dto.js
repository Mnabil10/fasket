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
exports.SortDto = exports.PaginationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class PaginationDto {
    constructor() {
        this.page = 1;
        this.pageSize = 20;
    }
    get skip() {
        return ((this.page ?? 1) - 1) * (this.pageSize ?? 20);
    }
    get take() {
        return this.takeParam ?? this.pageSize ?? 20;
    }
}
exports.PaginationDto = PaginationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Transform)(({ value }) => Number(value ?? 1)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PaginationDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 20, minimum: 1, maximum: 100 }),
    (0, class_transformer_1.Transform)(({ value, obj }) => {
        const source = value ?? obj?.limit ?? obj?.take ?? obj?.takeParam;
        const raw = source ?? 20;
        return Math.min(100, Number(raw));
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PaginationDto.prototype, "pageSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        name: 'limit',
        description: 'Alias for pageSize',
        minimum: 1,
        maximum: 100,
    }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Math.min(100, Number(value)))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PaginationDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        name: 'take',
        description: 'Alias for pageSize',
        minimum: 1,
        maximum: 100,
    }),
    (0, class_transformer_1.Expose)({ name: 'take' }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Math.min(100, Number(value)))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PaginationDto.prototype, "takeParam", void 0);
class SortDto {
    constructor() {
        this.sort = 'desc';
    }
}
exports.SortDto = SortDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['asc', 'desc'], default: 'desc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['asc', 'desc']),
    __metadata("design:type", String)
], SortDto.prototype, "sort", void 0);
//# sourceMappingURL=pagination.dto.js.map