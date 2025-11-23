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
exports.AdjustLoyaltyPointsDto = exports.LoyaltyHistoryQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const localize_util_1 = require("../../common/utils/localize.util");
class LoyaltyHistoryQueryDto {
}
exports.LoyaltyHistoryQueryDto = LoyaltyHistoryQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Number of recent transactions to return', minimum: 1, maximum: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], LoyaltyHistoryQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Optional language hint; ignored by service', enum: ['en', 'ar'] }),
    (0, class_transformer_1.Transform)(({ value }) => {
        return (0, localize_util_1.normalizeLang)(value);
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoyaltyHistoryQueryDto.prototype, "lang", void 0);
class AdjustLoyaltyPointsDto {
}
exports.AdjustLoyaltyPointsDto = AdjustLoyaltyPointsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Positive to grant points, negative to deduct' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], AdjustLoyaltyPointsDto.prototype, "points", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Reason shown in the audit trail' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], AdjustLoyaltyPointsDto.prototype, "reason", void 0);
//# sourceMappingURL=loyalty.dto.js.map