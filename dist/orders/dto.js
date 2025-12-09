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
exports.CreateOrderDto = exports.PaymentMethodDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var PaymentMethodDto;
(function (PaymentMethodDto) {
    PaymentMethodDto["COD"] = "COD";
    PaymentMethodDto["CARD"] = "CARD";
})(PaymentMethodDto || (exports.PaymentMethodDto = PaymentMethodDto = {}));
class CreateOrderDto {
}
exports.CreateOrderDto = CreateOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "addressId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: PaymentMethodDto, default: PaymentMethodDto.COD }),
    (0, class_validator_1.IsEnum)(PaymentMethodDto),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "couponCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, description: 'Number of loyalty points to redeem for this order' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateOrderDto.prototype, "loyaltyPointsToRedeem", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        required: false,
        description: 'Idempotency key to prevent duplicate order submission',
        minLength: 8,
        maxLength: 128,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(8, 128),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "idempotencyKey", void 0);
//# sourceMappingURL=dto.js.map