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
exports.AutomationHmacGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const hmac_util_1 = require("./hmac.util");
let AutomationHmacGuard = class AutomationHmacGuard {
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const secret = this.config.get('AUTOMATION_HMAC_SECRET');
        if (!secret) {
            throw new common_1.UnauthorizedException('Automation secret not configured');
        }
        const allowedIps = (this.config.get('AUTOMATION_ALLOWED_IPS') ?? '')
            .split(',')
            .map((ip) => ip.trim())
            .filter(Boolean);
        const clientIp = (req.ip || '').replace('::ffff:', '');
        const prod = (this.config.get('NODE_ENV') ?? '').toLowerCase() === 'production';
        if (prod && allowedIps.length === 0) {
            throw new common_1.ForbiddenException('IP allowlist required in production');
        }
        if (allowedIps.length && !allowedIps.includes(clientIp)) {
            throw new common_1.ForbiddenException('IP not allowed');
        }
        const timestamp = Number(req.headers['x-fasket-timestamp'] ?? req.headers['x-automation-timestamp']);
        const signature = String(req.headers['x-fasket-signature'] ?? '');
        const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
        const valid = (0, hmac_util_1.verifyAutomationSignature)(secret, { signature, timestamp }, rawBody, 300);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid automation signature');
        }
        return true;
    }
};
exports.AutomationHmacGuard = AutomationHmacGuard;
exports.AutomationHmacGuard = AutomationHmacGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AutomationHmacGuard);
//# sourceMappingURL=automation-hmac.guard.js.map