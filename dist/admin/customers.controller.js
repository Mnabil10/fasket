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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminCustomersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const pagination_dto_1 = require("./dto/pagination.dto");
const bcrypt = require("bcrypt");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const loyalty_service_1 = require("../loyalty/loyalty.service");
const loyalty_dto_1 = require("../loyalty/dto/loyalty.dto");
class ResetPasswordDto {
}
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "newPassword", void 0);
let AdminCustomersController = class AdminCustomersController {
    constructor(svc, loyalty) {
        this.svc = svc;
        this.loyalty = loyalty;
    }
    async list(q, page) {
        const where = {};
        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
            ];
        }
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
                skip: page?.skip, take: page?.take,
            }),
            this.svc.prisma.user.count({ where }),
        ]);
        return { items, total, page: page?.page, pageSize: page?.pageSize };
    }
    detail(id) {
        return this.svc.prisma.user.findUnique({
            where: { id },
            include: {
                addresses: true,
                orders: {
                    select: { id: true, totalCents: true, status: true, createdAt: true },
                    orderBy: { createdAt: 'desc' }, take: 20
                },
            },
        });
    }
    updateRole(id, dto) {
        return this.svc.prisma.user.update({ where: { id }, data: { role: dto.role } });
    }
    async resetPassword(id, dto) {
        const hash = await bcrypt.hash(dto.newPassword, 10);
        await this.svc.prisma.user.update({ where: { id }, data: { password: hash } });
        return { ok: true };
    }
    loyaltyHistory(id, query) {
        return this.loyalty.getAdminSummary(id, { historyLimit: query.limit });
    }
    adjustLoyalty(actor, id, dto) {
        return this.loyalty.adjustUserPoints({
            userId: id,
            points: dto.points,
            reason: dto.reason,
            actorId: actor.userId,
        });
    }
};
exports.AdminCustomersController = AdminCustomersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false, description: 'search name/phone/email' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated customers' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", Promise)
], AdminCustomersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOkResponse)({ description: 'Customer profile & recent orders' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminCustomersController.prototype, "detail", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, swagger_1.ApiOkResponse)({ description: 'Update user role' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminCustomersController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Patch)(':id/password'),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Reset user password' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ResetPasswordDto]),
    __metadata("design:returntype", Promise)
], AdminCustomersController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Get)(':id/loyalty'),
    (0, swagger_1.ApiOkResponse)({ description: 'Loyalty totals and transaction history' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, loyalty_dto_1.LoyaltyHistoryQueryDto]),
    __metadata("design:returntype", void 0)
], AdminCustomersController.prototype, "loyaltyHistory", null);
__decorate([
    (0, common_1.Post)(':id/loyalty-adjust'),
    (0, swagger_1.ApiOkResponse)({ description: 'Adjust loyalty balance' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, loyalty_dto_1.AdjustLoyaltyPointsDto]),
    __metadata("design:returntype", void 0)
], AdminCustomersController.prototype, "adjustLoyalty", null);
exports.AdminCustomersController = AdminCustomersController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Customers'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/customers', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        loyalty_service_1.LoyaltyService])
], AdminCustomersController);
//# sourceMappingURL=customers.controller.js.map