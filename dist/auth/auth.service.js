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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = require("bcrypt");
const jwt_1 = require("@nestjs/jwt");
let AuthService = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    async register(input) {
        const or = [{ phone: input.phone }];
        if (input.email)
            or.push({ email: input.email });
        const exists = await this.prisma.user.findFirst({ where: { OR: or } });
        if (exists)
            throw new common_1.BadRequestException('User already exists');
        const hash = await bcrypt.hash(input.password, 10);
        const user = await this.prisma.user.create({
            data: { name: input.name, phone: input.phone, email: input.email, password: hash },
            select: { id: true, name: true, phone: true, email: true, role: true },
        });
        const tokens = await this.issueTokens(user.id, user.role);
        return { user, ...tokens };
    }
    async login(input) {
        const user = await this.prisma.user.findUnique({ where: { phone: input.phone } });
        if (!user)
            throw new common_1.UnauthorizedException('Invalid phone or password');
        const ok = await bcrypt.compare(input.password, user.password);
        if (!ok)
            throw new common_1.UnauthorizedException('Invalid phone or password');
        const tokens = await this.issueTokens(user.id, user.role);
        const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
        return { user: safeUser, ...tokens };
    }
    async issueTokens(sub, role) {
        const access = await this.jwt.signAsync({ sub, role }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: Number(process.env.JWT_ACCESS_TTL || 900) });
        const refresh = await this.jwt.signAsync({ sub }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: Number(process.env.JWT_REFRESH_TTL || 1209600) });
        return { accessToken: access, refreshToken: refresh };
    }
    async issueTokensForUserId(sub) {
        const user = await this.prisma.user.findUnique({ where: { id: sub }, select: { role: true } });
        if (!user)
            throw new common_1.UnauthorizedException('User not found');
        return this.issueTokens(sub, user.role);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map