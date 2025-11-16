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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const request_context_service_1 = require("../context/request-context.service");
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    constructor(context) {
        super();
        this.context = context;
    }
    handleRequest(err, user, info, ctx) {
        const request = ctx.switchToHttp().getRequest();
        if (user?.userId)
            this.context.set('userId', user.userId);
        if (user?.role)
            this.context.set('role', user.role);
        if (user?.phone)
            this.context.set('phone', user.phone);
        if (user?.email)
            this.context.set('email', user.email);
        if (request?.ip) {
            this.context.set('ip', request.ip);
        }
        return super.handleRequest(err, user, info, ctx);
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [request_context_service_1.RequestContextService])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map