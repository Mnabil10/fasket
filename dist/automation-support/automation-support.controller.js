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
exports.AutomationSupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_hmac_guard_1 = require("../automation/automation-hmac.guard");
const throttler_1 = require("@nestjs/throttler");
const automation_support_service_1 = require("./automation-support.service");
const swagger_2 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class SupportOrderStatusDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SupportOrderStatusDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SupportOrderStatusDto.prototype, "orderCode", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SupportOrderStatusDto.prototype, "last4", void 0);
class SupportProductSearchDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SupportProductSearchDto.prototype, "q", void 0);
let AutomationSupportController = class AutomationSupportController {
    constructor(support) {
        this.support = support;
    }
    orderStatus(dto, req) {
        return this.support.orderStatusLookup({
            phone: dto.phone,
            orderCode: dto.orderCode,
            last4: dto.last4,
            ip: req.ip,
            correlationId: req.headers['x-correlation-id'],
        });
    }
    productSearch(dto, req) {
        return this.support.productSearch(dto.q, req.ip);
    }
    deliveryZones() {
        return this.support.deliveryZones();
    }
};
exports.AutomationSupportController = AutomationSupportController;
__decorate([
    (0, common_1.Post)('order-status'),
    (0, throttler_1.Throttle)({ supportBot: {} }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SupportOrderStatusDto, Object]),
    __metadata("design:returntype", void 0)
], AutomationSupportController.prototype, "orderStatus", null);
__decorate([
    (0, common_1.Post)('product-search'),
    (0, throttler_1.Throttle)({ supportBotSearch: {} }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SupportProductSearchDto, Object]),
    __metadata("design:returntype", void 0)
], AutomationSupportController.prototype, "productSearch", null);
__decorate([
    (0, common_1.Get)('delivery-zones'),
    (0, throttler_1.Throttle)({ supportBotSearch: {} }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AutomationSupportController.prototype, "deliveryZones", null);
exports.AutomationSupportController = AutomationSupportController = __decorate([
    (0, swagger_1.ApiTags)('Automation/Support'),
    (0, common_1.UseGuards)(automation_hmac_guard_1.AutomationHmacGuard, throttler_1.ThrottlerGuard),
    (0, common_1.Controller)({ path: 'automation/support', version: ['1'] }),
    __metadata("design:paramtypes", [automation_support_service_1.AutomationSupportService])
], AutomationSupportController);
//# sourceMappingURL=automation-support.controller.js.map