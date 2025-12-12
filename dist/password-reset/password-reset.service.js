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
var PasswordResetService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetService = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const bcrypt = require("bcrypt");
const prisma_service_1 = require("../prisma/prisma.service");
const otp_service_1 = require("../otp/otp.service");
const automation_events_service_1 = require("../automation/automation-events.service");
const audit_log_service_1 = require("../common/audit/audit-log.service");
let PasswordResetService = PasswordResetService_1 = class PasswordResetService {
    constructor(cache, prisma, otp, automation, audit) {
        this.cache = cache;
        this.prisma = prisma;
        this.otp = otp;
        this.automation = automation;
        this.audit = audit;
        this.logger = new common_1.Logger(PasswordResetService_1.name);
        this.passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;
    }
    async requestReset(phone, ip) {
        const result = await this.otp.requestOtp(phone, 'PASSWORD_RESET', ip);
        await this.automation.emit('auth.password_reset.requested', { phone, otpId: result.otpId }, { dedupeKey: `reset:requested:${phone}:${result.otpId}` });
        return result;
    }
    async confirmReset(resetToken, newPassword) {
        if (!resetToken?.trim()) {
            throw new common_1.BadRequestException('Reset token is required');
        }
        if (!this.passwordPolicy.test(newPassword)) {
            throw new common_1.BadRequestException('Password must be at least 8 chars and contain letters and numbers');
        }
        const entry = await this.otp.validateResetToken(resetToken.trim());
        const user = await this.prisma.user.findUnique({ where: { phone: entry.phone } });
        if (!user) {
            throw new common_1.UnauthorizedException('Account not found');
        }
        const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
        const hash = await bcrypt.hash(newPassword, rounds);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { password: hash },
        });
        try {
            const store = this.cache.store;
            if (typeof store?.keys === 'function') {
                const keys = await store.keys(`refresh:${user.id}:*`);
                await Promise.all(keys.map((key) => this.cache.del(key)));
            }
        }
        catch {
        }
        await this.automation.emit('auth.password_reset.completed', { phone: entry.phone, userId: user.id }, { dedupeKey: `reset:completed:${user.id}:${Date.now()}` });
        await this.audit.log({
            action: 'password.reset.completed',
            entity: 'user',
            entityId: user.id,
            before: null,
            after: { phone: this.maskPhone(entry.phone) },
        });
        return { success: true };
    }
    maskPhone(phone) {
        if (!phone)
            return '';
        if (phone.length <= 6)
            return '***';
        return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
    }
};
exports.PasswordResetService = PasswordResetService;
exports.PasswordResetService = PasswordResetService = PasswordResetService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object, prisma_service_1.PrismaService,
        otp_service_1.OtpService,
        automation_events_service_1.AutomationEventsService,
        audit_log_service_1.AuditLogService])
], PasswordResetService);
//# sourceMappingURL=password-reset.service.js.map