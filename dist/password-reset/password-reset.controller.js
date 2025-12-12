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
exports.PasswordResetController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const password_reset_service_1 = require("./password-reset.service");
const swagger_2 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PasswordResetRequestDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PasswordResetRequestDto.prototype, "phone", void 0);
class PasswordResetConfirmDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PasswordResetConfirmDto.prototype, "resetToken", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PasswordResetConfirmDto.prototype, "newPassword", void 0);
let PasswordResetController = class PasswordResetController {
    constructor(service) {
        this.service = service;
    }
    request(dto, req) {
        return this.service.requestReset(dto.phone, req.ip);
    }
    confirm(dto) {
        return this.service.confirmReset(dto.resetToken, dto.newPassword);
    }
};
exports.PasswordResetController = PasswordResetController;
__decorate([
    (0, common_1.Post)('request'),
    (0, throttler_1.Throttle)({ passwordResetRequest: {} }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PasswordResetRequestDto, Object]),
    __metadata("design:returntype", void 0)
], PasswordResetController.prototype, "request", null);
__decorate([
    (0, common_1.Post)('confirm'),
    (0, throttler_1.Throttle)({ passwordResetConfirm: {} }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PasswordResetConfirmDto]),
    __metadata("design:returntype", void 0)
], PasswordResetController.prototype, "confirm", null);
exports.PasswordResetController = PasswordResetController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, common_1.Controller)({ path: 'auth/password-reset', version: ['1', '2'] }),
    __metadata("design:paramtypes", [password_reset_service_1.PasswordResetService])
], PasswordResetController);
//# sourceMappingURL=password-reset.controller.js.map