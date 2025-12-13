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
var OtpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const cache_manager_1 = require("@nestjs/cache-manager");
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const automation_events_service_1 = require("../automation/automation-events.service");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("../auth/auth.service");
const audit_log_service_1 = require("../common/audit/audit-log.service");
let OtpService = OtpService_1 = class OtpService {
    constructor(cache, prisma, automation, config, auth, audit) {
        this.cache = cache;
        this.prisma = prisma;
        this.automation = automation;
        this.config = config;
        this.auth = auth;
        this.audit = audit;
        this.logger = new common_1.Logger(OtpService_1.name);
        this.otpTtlSec = Number(this.config.get('OTP_TTL_SECONDS') ?? 300);
        this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);
        this.lockMinutes = Number(this.config.get('OTP_LOCK_MINUTES') ?? 15);
        this.secret = this.config.get('OTP_SECRET') ?? this.config.get('JWT_ACCESS_SECRET') ?? 'otp-secret';
        this.ensureSecretStrength();
    }
    async requestOtp(phone, purpose, ip) {
        const normalizedPhone = this.normalizePhone(phone);
        this.ensurePurpose(purpose);
        await this.ensureRateLimit(normalizedPhone, ip);
        const otp = this.generateOtp();
        const otpId = (0, crypto_1.randomUUID)();
        const hash = this.hashOtp(otp);
        const expiresAt = Date.now() + this.otpTtlSec * 1000;
        const record = { otpHash: hash, otpId, attempts: 0, expiresAt };
        await this.cache.set(this.otpKey(purpose, normalizedPhone), record, this.otpTtlSec);
        await this.automation.emit('auth.otp.requested', { phone: normalizedPhone, otpId, purpose, otp, expiresInSeconds: this.otpTtlSec }, { dedupeKey: `otp:requested:${purpose}:${normalizedPhone}:${otpId}` });
        await this.audit.log({
            action: 'otp.requested',
            entity: 'otp',
            entityId: otpId,
            before: null,
            after: { purpose, phone: this.maskPhone(normalizedPhone) },
        });
        return { otpId, expiresInSeconds: this.otpTtlSec };
    }
    async verifyOtp(phone, purpose, otpId, otp, ip) {
        const normalizedPhone = this.normalizePhone(phone);
        this.ensurePurpose(purpose);
        const lockKey = this.lockKey(purpose, normalizedPhone);
        const locked = await this.cache.get(lockKey);
        if (locked) {
            await this.audit.log({
                action: 'otp.locked',
                entity: 'otp',
                entityId: otpId,
                before: null,
                after: { purpose, phone: this.maskPhone(normalizedPhone) },
            });
            throw new common_1.UnauthorizedException('Too many attempts. Please try again later.');
        }
        const record = await this.cache.get(this.otpKey(purpose, normalizedPhone));
        if (!record || record.otpId !== otpId || record.expiresAt < Date.now()) {
            await this.audit.log({
                action: 'otp.verified.failed',
                entity: 'otp',
                entityId: otpId,
                before: null,
                after: { purpose, phone: this.maskPhone(normalizedPhone), reason: 'expired_or_missing' },
            });
            throw new common_1.UnauthorizedException('Invalid or expired OTP');
        }
        const valid = this.hashOtp(otp) === record.otpHash;
        if (!valid) {
            const attempts = record.attempts + 1;
            record.attempts = attempts;
            const ttl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
            await this.cache.set(this.otpKey(purpose, normalizedPhone), record, ttl);
            if (attempts >= this.maxAttempts) {
                await this.cache.set(lockKey, true, this.lockMinutes * 60);
                await this.cache.del(this.otpKey(purpose, normalizedPhone));
            }
            await this.audit.log({
                action: 'otp.verified.failed',
                entity: 'otp',
                entityId: otpId,
                before: null,
                after: { purpose, phone: this.maskPhone(normalizedPhone), attempts },
            });
            throw new common_1.UnauthorizedException('Invalid OTP');
        }
        await this.cache.del(this.otpKey(purpose, normalizedPhone));
        await this.cache.del(lockKey);
        await this.automation.emit('auth.otp.verified', { phone: normalizedPhone, otpId, purpose }, { dedupeKey: `otp:verified:${purpose}:${normalizedPhone}:${otpId}` });
        await this.audit.log({
            action: 'otp.verified.success',
            entity: 'otp',
            entityId: otpId,
            before: null,
            after: { purpose, phone: this.maskPhone(normalizedPhone) },
        });
        if (purpose === 'LOGIN') {
            const user = await this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
            if (!user)
                throw new common_1.UnauthorizedException('Account not found');
            const tokens = await this.auth.issueTokensForUserId(user.id);
            return { success: true, tokens };
        }
        if (purpose === 'PASSWORD_RESET') {
            const resetToken = (0, crypto_1.randomUUID)();
            const hashedToken = this.hashOtp(resetToken);
            const ttl = Number(process.env.RESET_TOKEN_TTL_SECONDS ?? 900);
            await this.cache.set(this.resetKey(hashedToken), { phone: normalizedPhone, otpId }, ttl);
            return { success: true, resetToken, expiresInSeconds: ttl };
        }
        return { success: true };
    }
    async validateResetToken(resetToken) {
        const hashed = this.hashOtp(resetToken);
        const entry = await this.cache.get(this.resetKey(hashed));
        if (!entry) {
            throw new common_1.UnauthorizedException('Reset token is invalid or expired');
        }
        await this.cache.del(this.resetKey(hashed));
        return entry;
    }
    async verifyOtpLegacy(phone, purpose, otp, ip) {
        const record = await this.cache.get(this.otpKey(purpose, this.normalizePhone(phone)));
        if (!record) {
            throw new common_1.UnauthorizedException('Invalid or expired OTP');
        }
        return this.verifyOtp(phone, purpose, record.otpId, otp, ip);
    }
    ensureSecretStrength() {
        const env = (this.config.get('NODE_ENV') || '').toLowerCase();
        const prodLike = env === 'production' || env === 'staging';
        const tooWeak = !this.secret || this.secret === 'otp-secret' || this.secret.length < 16;
        if (tooWeak) {
            const msg = 'OTP_SECRET is missing or too weak';
            if (prodLike) {
                this.logger.error(msg);
                throw new Error(msg);
            }
            this.logger.warn(msg);
        }
    }
    ensurePurpose(purpose) {
        if (!['LOGIN', 'PASSWORD_RESET'].includes(purpose)) {
            throw new common_1.BadRequestException('Invalid OTP purpose');
        }
    }
    async ensureRateLimit(phone, ip) {
        await this.bumpOrThrow(`otp:req:phone:${phone}`, 3, 600, 'Too many OTP requests for this phone');
        if (ip) {
            await this.bumpOrThrow(`otp:req:ip:${ip}`, 10, 600, 'Too many OTP requests from this IP');
        }
    }
    async bumpOrThrow(key, limit, ttl, message) {
        const current = (await this.cache.get(key)) ?? 0;
        if (current >= limit) {
            throw new common_1.UnauthorizedException(message);
        }
        await this.cache.set(key, current + 1, ttl);
    }
    otpKey(purpose, phone) {
        return `otp:${purpose}:${phone}`;
    }
    lockKey(purpose, phone) {
        return `otp:lock:${purpose}:${phone}`;
    }
    resetKey(hashedToken) {
        return `reset:${hashedToken}`;
    }
    normalizePhone(phone) {
        const trimmed = (phone || '').trim();
        const e164 = /^\+?[1-9]\d{7,14}$/;
        if (!e164.test(trimmed)) {
            throw new common_1.BadRequestException('Invalid phone');
        }
        return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    }
    generateOtp() {
        return ('' + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
    }
    hashOtp(input) {
        return (0, crypto_1.createHash)('sha256').update(`${input}:${this.secret}`).digest('hex');
    }
    maskPhone(phone) {
        if (!phone)
            return '';
        if (phone.length <= 6)
            return '***';
        return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = OtpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object, prisma_service_1.PrismaService,
        automation_events_service_1.AutomationEventsService,
        config_1.ConfigService,
        auth_service_1.AuthService,
        audit_log_service_1.AuditLogService])
], OtpService);
//# sourceMappingURL=otp.service.js.map