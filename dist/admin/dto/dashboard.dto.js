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
exports.ThresholdDto = exports.LimitDto = exports.TimeSeriesDto = exports.RangeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RangeDto {
}
exports.RangeDto = RangeDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date inclusive' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RangeDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date inclusive' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RangeDto.prototype, "to", void 0);
class TimeSeriesDto extends RangeDto {
    constructor() {
        super(...arguments);
        this.granularity = 'day';
    }
}
exports.TimeSeriesDto = TimeSeriesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['day', 'week', 'month'], default: 'day' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['day', 'week', 'month']),
    __metadata("design:type", String)
], TimeSeriesDto.prototype, "granularity", void 0);
class LimitDto {
    constructor() {
        this.limit = 10;
    }
}
exports.LimitDto = LimitDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10, minimum: 1, maximum: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], LimitDto.prototype, "limit", void 0);
class ThresholdDto {
    constructor() {
        this.threshold = 10;
    }
}
exports.ThresholdDto = ThresholdDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ThresholdDto.prototype, "threshold", void 0);
//# sourceMappingURL=dashboard.dto.js.map