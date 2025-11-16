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
exports.RegisterDeviceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const sanitize_util_1 = require("../common/utils/sanitize.util");
class RegisterDeviceDto {
    constructor() {
        this.platform = 'unknown';
    }
}
exports.RegisterDeviceDto = RegisterDeviceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Push token from FCM/OneSignal/APNS' }),
    (0, class_transformer_1.Transform)(({ value }) => (0, sanitize_util_1.cleanString)(value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    __metadata("design:type", String)
], RegisterDeviceDto.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' }),
    (0, class_transformer_1.Transform)(({ value }) => (value ? String(value).toLowerCase().trim() : 'unknown')),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ios', 'android', 'web', 'unknown']),
    __metadata("design:type", String)
], RegisterDeviceDto.prototype, "platform", void 0);
//# sourceMappingURL=dto.js.map