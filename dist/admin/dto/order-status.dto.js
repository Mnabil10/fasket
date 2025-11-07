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
exports.UpdateOrderStatusDto = exports.AdminOrderStatusDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var AdminOrderStatusDto;
(function (AdminOrderStatusDto) {
    AdminOrderStatusDto["PENDING"] = "PENDING";
    AdminOrderStatusDto["PROCESSING"] = "PROCESSING";
    AdminOrderStatusDto["OUT_FOR_DELIVERY"] = "OUT_FOR_DELIVERY";
    AdminOrderStatusDto["DELIVERED"] = "DELIVERED";
    AdminOrderStatusDto["CANCELED"] = "CANCELED";
})(AdminOrderStatusDto || (exports.AdminOrderStatusDto = AdminOrderStatusDto = {}));
class UpdateOrderStatusDto {
}
exports.UpdateOrderStatusDto = UpdateOrderStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: AdminOrderStatusDto }),
    (0, class_validator_1.IsEnum)(AdminOrderStatusDto),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "actorId", void 0);
//# sourceMappingURL=order-status.dto.js.map