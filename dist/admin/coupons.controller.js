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
var AdminCouponsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminCouponsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const pagination_dto_1 = require("./dto/pagination.dto");
const twofa_guard_1 = require("../common/guards/twofa.guard");
const throttler_1 = require("@nestjs/throttler");
const common_2 = require("@nestjs/common");
let AdminCouponsController = AdminCouponsController_1 = class AdminCouponsController {
    constructor(svc) {
        this.svc = svc;
        this.logger = new common_1.Logger(AdminCouponsController_1.name);
    }
    async list(q, page) {
        const where = {};
        if (q)
            where.code = { contains: q, mode: 'insensitive' };
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page?.skip, take: page?.take }),
            this.svc.prisma.coupon.count({ where }),
        ]);
        return { items, total, page: page?.page, pageSize: page?.pageSize };
    }
    create(dto) {
        const data = { ...dto };
        if (dto.percent != null) {
            data.type = dto.type ?? 'PERCENT';
            data.valueCents = Number(dto.percent);
        }
        if (data.type === 'FIXED' && (data.valueCents === undefined || data.valueCents === null)) {
            throw new common_2.BadRequestException('valueCents is required for FIXED coupons');
        }
        if (data.type === 'PERCENT' && (data.valueCents === undefined || data.valueCents === null)) {
            throw new common_2.BadRequestException('percent (valueCents) is required for PERCENT coupons');
        }
        const createdPromise = this.svc.prisma.coupon.create({ data });
        createdPromise.then(async (coupon) => {
            this.logger.log({ msg: 'Coupon created', couponId: coupon.id, code: coupon.code, type: coupon.type });
            await this.svc.audit.log({
                action: 'coupon.create',
                entity: 'Coupon',
                entityId: coupon.id,
                after: coupon,
            });
        });
        return createdPromise;
    }
    update(id, dto) {
        return this.svc.prisma.$transaction(async (tx) => {
            const before = await tx.coupon.findUnique({ where: { id } });
            if (!before) {
                throw new Error('Coupon not found');
            }
            const data = { ...dto };
            if (dto.percent != null) {
                data.type = dto.type ?? 'PERCENT';
                data.valueCents = Number(dto.percent);
            }
            if (data.type === 'FIXED' && data.valueCents === undefined && before.type === 'FIXED') {
                data.valueCents = before.valueCents;
            }
            if ((data.type ?? before.type) === 'PERCENT' && (data.valueCents === undefined || data.valueCents === null)) {
                throw new common_2.BadRequestException('percent (valueCents) is required for PERCENT coupons');
            }
            const updated = await tx.coupon.update({ where: { id }, data });
            this.logger.log({ msg: 'Coupon updated', couponId: updated.id, code: updated.code, isActive: updated.isActive });
            await this.svc.audit.log({
                action: 'coupon.update',
                entity: 'Coupon',
                entityId: id,
                before,
                after: updated,
            });
            return updated;
        });
    }
};
exports.AdminCouponsController = AdminCouponsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated coupons' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", Promise)
], AdminCouponsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "update", null);
exports.AdminCouponsController = AdminCouponsController = AdminCouponsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin/Coupons'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.UseGuards)(twofa_guard_1.TwoFaGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60 } }),
    (0, common_1.Controller)({ path: 'admin/coupons', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminCouponsController);
//# sourceMappingURL=coupons.controller.js.map