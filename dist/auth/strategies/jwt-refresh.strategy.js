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
exports.JwtRefreshStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
let JwtRefreshStrategy = class JwtRefreshStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'jwt-refresh') {
    constructor(config) {
        const secret = config.get('JWT_REFRESH_SECRET');
        if (!secret) {
            throw new Error('JWT_REFRESH_SECRET is not configured');
        }
        const refreshTokenExtractor = (req) => {
            if (!req)
                return null;
            const headerToken = req.headers['x-refresh-token'];
            const cookieToken = req?.cookies?.refreshToken ?? req?.signedCookies?.refreshToken;
            const bodyToken = req.body?.refreshToken;
            const bearerToken = passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken()(req);
            if (typeof headerToken === 'string')
                return headerToken;
            if (Array.isArray(headerToken))
                return headerToken[0];
            return bodyToken || cookieToken || bearerToken;
        };
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromExtractors([refreshTokenExtractor]),
            secretOrKey: secret,
            ignoreExpiration: false,
        });
    }
    async validate(payload) {
        return { userId: payload.sub };
    }
};
exports.JwtRefreshStrategy = JwtRefreshStrategy;
exports.JwtRefreshStrategy = JwtRefreshStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], JwtRefreshStrategy);
//# sourceMappingURL=jwt-refresh.strategy.js.map