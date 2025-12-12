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
exports.OtpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const otp_service_1 = require("./otp.service");
const swagger_2 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class OtpRequestDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OtpRequestDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ enum: ['LOGIN', 'PASSWORD_RESET'] }),
    (0, class_validator_1.IsIn)(['LOGIN', 'PASSWORD_RESET']),
    __metadata("design:type", String)
], OtpRequestDto.prototype, "purpose", void 0);
class OtpVerifyDto {
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OtpVerifyDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ enum: ['LOGIN', 'PASSWORD_RESET'] }),
    (0, class_validator_1.IsIn)(['LOGIN', 'PASSWORD_RESET']),
    __metadata("design:type", String)
], OtpVerifyDto.prototype, "purpose", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OtpVerifyDto.prototype, "otpId", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OtpVerifyDto.prototype, "otp", void 0);
let OtpController = class OtpController {
    constructor(otp) {
        this.otp = otp;
    }
    request(dto, req) {
        return this.otp.requestOtp(dto.phone, dto.purpose, req.ip);
    }
    verify(dto, req) {
        return this.otp.verifyOtp(dto.phone, dto.purpose, dto.otpId, dto.otp, req.ip);
    }
};
exports.OtpController = OtpController;
__decorate([
    (0, common_1.Post)('request'),
    (0, throttler_1.Throttle)({ otpRequest: {} }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [OtpRequestDto, Object]),
    __metadata("design:returntype", void 0)
], OtpController.prototype, "request", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, throttler_1.Throttle)({ otpVerify: {} }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [OtpVerifyDto, Object]),
    __metadata("design:returntype", void 0)
], OtpController.prototype, "verify", null);
exports.OtpController = OtpController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, common_1.Controller)({ path: 'auth/otp', version: ['1', '2'] }),
    __metadata("design:paramtypes", [otp_service_1.OtpService])
], OtpController);
//# sourceMappingURL=otp.controller.js.map