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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcrypt");
const crypto_1 = require("crypto");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const device_util_1 = require("../common/utils/device.util");
const errors_1 = require("../common/errors");
const cache_manager_1 = require("@nestjs/cache-manager");
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwt, rateLimiter, config, cache) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.rateLimiter = rateLimiter;
        this.config = config;
        this.cache = cache;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.otpDigits = 6;
    }
    normalizeEmail(email) {
        return email ? email.trim().toLowerCase() : undefined;
    }
    bcryptRounds() {
        const parsed = Number(this.config.get('BCRYPT_ROUNDS') ?? 12);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
    }
    async register(input) {
        const normalizedEmail = this.normalizeEmail(input.email);
        const or = [{ phone: input.phone }];
        if (normalizedEmail)
            or.push({ email: normalizedEmail });
        const exists = await this.prisma.user.findFirst({ where: { OR: or } });
        if (exists)
            throw new common_1.BadRequestException('User already exists');
        const hash = await bcrypt.hash(input.password, this.bcryptRounds());
        const user = await this.prisma.user.create({
            data: { name: input.name, phone: input.phone, email: normalizedEmail, password: hash },
            select: { id: true, name: true, phone: true, email: true, role: true },
        });
        const tokens = await this.issueTokens({
            id: user.id,
            role: user.role,
            phone: user.phone,
            email: user.email,
        });
        await this.logSession(user.id, { ip: undefined, userAgent: undefined });
        return { user, ...tokens };
    }
    async login(input, metadata) {
        const identifier = input.identifier?.trim();
        if (!identifier) {
            this.logger.warn({ msg: 'Login failed - empty identifier', ip: metadata.ip });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.rateLimiter.ensureCanAttempt(identifier, metadata.ip);
        const normalizedEmail = this.normalizeEmail(identifier);
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { phone: identifier },
                    { email: identifier },
                    ...(normalizedEmail && normalizedEmail !== identifier ? [{ email: normalizedEmail }] : []),
                ],
            },
        });
        if (!user) {
            await this.rateLimiter.trackFailure(identifier, metadata.ip);
            this.logger.warn({ msg: 'Login failed - user not found', identifier, ip: metadata.ip });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const ok = await bcrypt.compare(input.password, user.password);
        if (!ok) {
            await this.rateLimiter.trackFailure(identifier, metadata.ip);
            this.logger.warn({ msg: 'Login failed - bad password', userId: user.id, ip: metadata.ip });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.role === 'ADMIN') {
            if (!user.twoFaEnabled) {
                throw new errors_1.DomainError(errors_1.ErrorCode.AUTH_2FA_REQUIRED, 'Admin accounts must enable two-factor authentication');
            }
            if (!input.otp || !this.verifyTotp(input.otp, user.twoFaSecret ?? '')) {
                throw new errors_1.DomainError(errors_1.ErrorCode.AUTH_2FA_REQUIRED, 'Two-factor authentication required');
            }
        }
        await this.rateLimiter.reset(identifier, metadata.ip);
        const tokens = await this.issueTokens({
            id: user.id,
            role: user.role,
            phone: user.phone,
            email: user.email,
            twoFaVerified: !user.twoFaEnabled || Boolean(input.otp),
        });
        const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
        await this.logSession(user.id, metadata);
        this.logger.log({ msg: 'Login success', userId: user.id, ip: metadata.ip });
        return { user: safeUser, ...tokens };
    }
    async setupAdminTwoFa(userId) {
        const secret = this.generateSecret();
        const secretBase32 = this.toBase32(Buffer.from(secret, 'hex'));
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFaSecret: secret, twoFaEnabled: false },
        });
        return {
            secret,
            secretBase32,
            otpauthUrl: `otpauth://totp/Fasket:${userId}?secret=${secretBase32}&issuer=Fasket`,
        };
    }
    async enableAdminTwoFa(userId, otp) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFaSecret: true } });
        if (!user?.twoFaSecret) {
            throw new common_1.BadRequestException('2FA not initialized');
        }
        if (!this.verifyTotp(otp, user.twoFaSecret)) {
            throw new errors_1.DomainError(errors_1.ErrorCode.AUTH_2FA_REQUIRED, 'Invalid 2FA code');
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFaEnabled: true },
        });
        return { enabled: true };
    }
    async disableAdminTwoFa(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFaEnabled: false, twoFaSecret: null },
        });
        return { enabled: false };
    }
    async issueTokens(user) {
        const accessSecret = this.config.get('JWT_ACCESS_SECRET');
        if (!accessSecret) {
            throw new Error('JWT_ACCESS_SECRET is not configured');
        }
        const refreshSecret = this.config.get('JWT_REFRESH_SECRET');
        if (!refreshSecret) {
            throw new Error('JWT_REFRESH_SECRET is not configured');
        }
        const accessTtl = this.config.get('JWT_ACCESS_TTL') ?? 900;
        const refreshTtl = this.config.get('JWT_REFRESH_TTL') ?? 1209600;
        const jti = (0, crypto_1.randomUUID)();
        const accessPayload = {
            sub: user.id,
            role: user.role,
            phone: user.phone,
            email: user.email,
            twoFaVerified: user.twoFaVerified ?? true,
        };
        const access = await this.jwt.signAsync(accessPayload, {
            secret: accessSecret,
            expiresIn: accessTtl,
        });
        const refresh = await this.jwt.signAsync({ sub: user.id, jti }, {
            secret: refreshSecret,
            expiresIn: refreshTtl,
        });
        await this.cache.set(this.refreshCacheKey(user.id, jti), true, refreshTtl);
        return { accessToken: access, refreshToken: refresh };
    }
    async issueTokensForUserId(sub, previousJti) {
        const user = await this.prisma.user.findUnique({
            where: { id: sub },
            select: { role: true, phone: true, email: true, twoFaEnabled: true },
        });
        if (!user) {
            this.logger.warn({ msg: 'Refresh token rejected - user missing', userId: sub });
            throw new common_1.UnauthorizedException('User not found');
        }
        if (previousJti) {
            const allowed = await this.cache.get(this.refreshCacheKey(sub, previousJti));
            if (!allowed) {
                throw new common_1.UnauthorizedException('Refresh token reuse detected');
            }
            await this.cache.del(this.refreshCacheKey(sub, previousJti));
        }
        return this.issueTokens({
            id: sub,
            role: user.role,
            phone: user.phone,
            email: user.email ?? undefined,
            twoFaVerified: !user.twoFaEnabled,
        });
    }
    async logSession(userId, metadata) {
        try {
            await this.prisma.sessionLog.create({
                data: {
                    userId,
                    ip: metadata.ip,
                    userAgent: metadata.userAgent,
                    device: (0, device_util_1.buildDeviceInfo)(metadata.userAgent),
                },
            });
        }
        catch (error) {
            this.logger.warn(`Session log skipped for ${userId}: ${error.message}`);
        }
    }
    generateSecret() {
        return (0, crypto_1.randomBytes)(20).toString('hex');
    }
    toBase32(buffer) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        let output = '';
        for (const byte of buffer) {
            bits += byte.toString(2).padStart(8, '0');
            while (bits.length >= 5) {
                const chunk = bits.slice(0, 5);
                bits = bits.slice(5);
                output += alphabet[parseInt(chunk, 2)];
            }
        }
        if (bits.length) {
            output += alphabet[parseInt(bits.padEnd(5, '0'), 2)];
        }
        return output;
    }
    verifyTotp(token, secretHex) {
        if (!token || !secretHex)
            return false;
        const secret = Buffer.from(secretHex, 'hex');
        const step = 30;
        const counter = Math.floor(Date.now() / 1000 / step);
        for (let i = -1; i <= 1; i++) {
            const expected = this.generateTotp(secret, counter + i);
            if (expected === token)
                return true;
        }
        return false;
    }
    generateTotp(secret, counter) {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64BE(BigInt(counter));
        const hmac = (0, crypto_1.createHmac)('sha1', secret).update(buf).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const code = ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);
        const digits = code % 10 ** this.otpDigits;
        return digits.toString().padStart(this.otpDigits, '0');
    }
    refreshCacheKey(userId, jti) {
        return `refresh:${userId}:${jti}`;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        auth_rate_limit_service_1.AuthRateLimitService,
        config_1.ConfigService, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map