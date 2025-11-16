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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcrypt");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const device_util_1 = require("../common/utils/device.util");
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwt, rateLimiter, config) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.rateLimiter = rateLimiter;
        this.config = config;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    normalizeEmail(email) {
        return email ? email.trim().toLowerCase() : undefined;
    }
    async register(input) {
        const normalizedEmail = this.normalizeEmail(input.email);
        const or = [{ phone: input.phone }];
        if (normalizedEmail)
            or.push({ email: normalizedEmail });
        const exists = await this.prisma.user.findFirst({ where: { OR: or } });
        if (exists)
            throw new common_1.BadRequestException('User already exists');
        const hash = await bcrypt.hash(input.password, 10);
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
        await this.rateLimiter.reset(identifier, metadata.ip);
        const tokens = await this.issueTokens({
            id: user.id,
            role: user.role,
            phone: user.phone,
            email: user.email,
        });
        const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
        await this.logSession(user.id, metadata);
        this.logger.log({ msg: 'Login success', userId: user.id, ip: metadata.ip });
        return { user: safeUser, ...tokens };
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
        const accessPayload = {
            sub: user.id,
            role: user.role,
            phone: user.phone,
            email: user.email,
        };
        const access = await this.jwt.signAsync(accessPayload, {
            secret: accessSecret,
            expiresIn: accessTtl,
        });
        const refresh = await this.jwt.signAsync({ sub: user.id }, {
            secret: refreshSecret,
            expiresIn: refreshTtl,
        });
        return { accessToken: access, refreshToken: refresh };
    }
    async issueTokensForUserId(sub) {
        const user = await this.prisma.user.findUnique({
            where: { id: sub },
            select: { role: true, phone: true, email: true },
        });
        if (!user) {
            this.logger.warn({ msg: 'Refresh token rejected - user missing', userId: sub });
            throw new common_1.UnauthorizedException('User not found');
        }
        return this.issueTokens({
            id: sub,
            role: user.role,
            phone: user.phone,
            email: user.email ?? undefined,
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        auth_rate_limit_service_1.AuthRateLimitService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map