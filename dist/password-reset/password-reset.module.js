"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetModule = void 0;
const common_1 = require("@nestjs/common");
const password_reset_controller_1 = require("./password-reset.controller");
const password_reset_service_1 = require("./password-reset.service");
const otp_module_1 = require("../otp/otp.module");
const prisma_module_1 = require("../prisma/prisma.module");
const automation_module_1 = require("../automation/automation.module");
const common_module_1 = require("../common/common.module");
let PasswordResetModule = class PasswordResetModule {
};
exports.PasswordResetModule = PasswordResetModule;
exports.PasswordResetModule = PasswordResetModule = __decorate([
    (0, common_1.Module)({
        imports: [otp_module_1.OtpModule, prisma_module_1.PrismaModule, automation_module_1.AutomationModule, common_module_1.CommonModule],
        controllers: [password_reset_controller_1.PasswordResetController],
        providers: [password_reset_service_1.PasswordResetService],
        exports: [password_reset_service_1.PasswordResetService],
    })
], PasswordResetModule);
//# sourceMappingURL=password-reset.module.js.map