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
exports.AuthCompatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const otp_service_1 = require("../otp/otp.service");
const password_reset_service_1 = require("../password-reset/password-reset.service");
let AuthCompatController = class AuthCompatController {
    constructor(otp, passwordReset) {
        this.otp = otp;
        this.passwordReset = passwordReset;
    }
    async sendOtp(body, req, res) {
        const result = await this.otp.requestOtp(body.phone, 'LOGIN', req.ip);
        res.setHeader('x-deprecated-endpoint', 'true');
        return res.json(result);
    }
    async verifyOtp(body, req, res) {
        const result = await this.otp.verifyOtpLegacy(body.phone, 'LOGIN', body.otp, req.ip);
        res.setHeader('x-deprecated-endpoint', 'true');
        return res.json(result);
    }
    async forgotPassword(body, req, res) {
        const result = await this.passwordReset.requestReset(body.identifier, req.ip);
        res.setHeader('x-deprecated-endpoint', 'true');
        return res.json(result);
    }
    async resetPassword(body, req, res) {
        const otpResult = await this.otp.verifyOtpLegacy(body.identifier, 'PASSWORD_RESET', body.otp, req.ip);
        const resetToken = otpResult?.resetToken ?? otpResult?.reset_token;
        if (!resetToken) {
            res.setHeader('x-deprecated-endpoint', 'true');
            return res.status(400).json({ success: false, message: 'Reset token missing' });
        }
        const result = await this.passwordReset.confirmReset(resetToken, body.newPassword);
        res.setHeader('x-deprecated-endpoint', 'true');
        return res.json(result);
    }
};
exports.AuthCompatController = AuthCompatController;
__decorate([
    (0, common_1.Post)('otp/send'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthCompatController.prototype, "sendOtp", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthCompatController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthCompatController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthCompatController.prototype, "resetPassword", null);
exports.AuthCompatController = AuthCompatController = __decorate([
    (0, swagger_1.ApiTags)('AuthCompat'),
    (0, common_1.Controller)({ path: 'auth', version: ['1', '2'] }),
    __metadata("design:paramtypes", [otp_service_1.OtpService, password_reset_service_1.PasswordResetService])
], AuthCompatController);
//# sourceMappingURL=auth-compat.controller.js.map