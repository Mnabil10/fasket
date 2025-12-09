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
exports.AdminOrderListDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
class AdminOrderListDto extends pagination_dto_1.PaginationDto {
}
exports.AdminOrderListDto = AdminOrderListDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.OrderStatus, description: 'Filter by order status' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.OrderStatus),
    __metadata("design:type", String)
], AdminOrderListDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date - created at greater than or equal' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (value ? new Date(value) : undefined)),
    __metadata("design:type", Date)
], AdminOrderListDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date - created at less than or equal' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (value ? new Date(value) : undefined)),
    __metadata("design:type", Date)
], AdminOrderListDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Search by customer name/phone/email' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminOrderListDto.prototype, "customer", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum totalCents', type: Number }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AdminOrderListDto.prototype, "minTotalCents", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum totalCents', type: Number }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AdminOrderListDto.prototype, "maxTotalCents", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by driver id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AdminOrderListDto.prototype, "driverId", void 0);
//# sourceMappingURL=admin-order-list.dto.js.map