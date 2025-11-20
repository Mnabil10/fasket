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
exports.VerifyTwoFaDto = exports.UpdateProfileDto = exports.RefreshDto = exports.LoginDto = exports.RegisterDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const sanitize_util_1 = require("../common/utils/sanitize.util");
const passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;
class RegisterDto {
}
exports.RegisterDto = RegisterDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsPhoneNumber)('EG'),
    __metadata("design:type", String)
], RegisterDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)?.toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], RegisterDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(passwordPolicy, { message: 'Password must be at least 8 chars and contain letters and numbers' }),
    __metadata("design:type", String)
], RegisterDto.prototype, "password", void 0);
class LoginDto {
}
exports.LoginDto = LoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Phone number or email address', example: '+201234567890 or user@fasket.com' }),
    (0, class_transformer_1.Transform)(({ value, obj }) => (0, sanitize_util_1.cleanString)(String(value ?? obj.identifier ?? obj.phone ?? obj.email ?? obj.username ?? obj.login ?? ''))),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "identifier", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)?.toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "login", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(passwordPolicy, { message: 'Invalid password format' }),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, description: '6-digit TOTP code when 2FA is enabled' }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "otp", void 0);
class RefreshDto {
}
exports.RefreshDto = RefreshDto;
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefreshDto.prototype, "refreshToken", void 0);
class UpdateProfileDto {
}
exports.UpdateProfileDto = UpdateProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanNullableString)(value)),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(passwordPolicy, { message: 'Password must be at least 8 chars and contain letters and numbers' }),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "password", void 0);
class VerifyTwoFaDto {
}
exports.VerifyTwoFaDto = VerifyTwoFaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '6-digit TOTP' }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyTwoFaDto.prototype, "otp", void 0);
//# sourceMappingURL=dto.js.map