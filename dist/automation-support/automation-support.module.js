"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationSupportModule = void 0;
const common_1 = require("@nestjs/common");
const automation_support_controller_1 = require("./automation-support.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const settings_module_1 = require("../settings/settings.module");
const automation_support_service_1 = require("./automation-support.service");
const automation_module_1 = require("../automation/automation.module");
const common_module_1 = require("../common/common.module");
const automation_hmac_guard_1 = require("../automation/automation-hmac.guard");
let AutomationSupportModule = class AutomationSupportModule {
};
exports.AutomationSupportModule = AutomationSupportModule;
exports.AutomationSupportModule = AutomationSupportModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, settings_module_1.SettingsModule, automation_module_1.AutomationModule, common_module_1.CommonModule],
        controllers: [automation_support_controller_1.AutomationSupportController],
        providers: [automation_support_service_1.AutomationSupportService, automation_hmac_guard_1.AutomationHmacGuard],
    })
], AutomationSupportModule);
//# sourceMappingURL=automation-support.module.js.map