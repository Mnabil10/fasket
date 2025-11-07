"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminGuard = exports.StaffOrAdmin = exports.AdminOnly = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const roles_guard_1 = require("../common/guards/roles.guard");
const AdminOnly = () => (0, common_1.applyDecorators)((0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard), (0, roles_decorator_1.Roles)('ADMIN'));
exports.AdminOnly = AdminOnly;
const StaffOrAdmin = () => (0, common_1.applyDecorators)((0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard), (0, roles_decorator_1.Roles)('ADMIN', 'STAFF'));
exports.StaffOrAdmin = StaffOrAdmin;
class AdminGuard {
    canActivate(ctx) {
        const user = ctx.switchToHttp().getRequest().user;
        if (user?.role === 'ADMIN')
            return true;
        throw new common_1.ForbiddenException('Admin only');
    }
}
exports.AdminGuard = AdminGuard;
//# sourceMappingURL=_admin-guards.js.map