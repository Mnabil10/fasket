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
var AdminOrdersController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminOrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const order_status_dto_1 = require("./dto/order-status.dto");
const pagination_dto_1 = require("./dto/pagination.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AdminOrdersController = AdminOrdersController_1 = class AdminOrdersController {
    constructor(svc) {
        this.svc = svc;
        this.logger = new common_1.Logger(AdminOrdersController_1.name);
    }
    async list(status, from, to, customer, minTotalCents, maxTotalCents, page) {
        const where = {};
        if (status)
            where.status = status;
        if (from || to)
            where.createdAt = {};
        if (from)
            where.createdAt.gte = new Date(from);
        if (to)
            where.createdAt.lte = new Date(to);
        if (customer) {
            where.user = {
                OR: [
                    { name: { contains: customer, mode: 'insensitive' } },
                    { phone: { contains: customer, mode: 'insensitive' } },
                    { email: { contains: customer, mode: 'insensitive' } },
                ],
            };
        }
        if (minTotalCents || maxTotalCents) {
            where.totalCents = {};
            if (minTotalCents)
                where.totalCents.gte = Number(minTotalCents);
            if (maxTotalCents)
                where.totalCents.lte = Number(maxTotalCents);
        }
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, name: true, phone: true } },
                },
                skip: page?.skip, take: page?.take,
            }),
            this.svc.prisma.order.count({ where }),
        ]);
        return { items, total, page: page?.page, pageSize: page?.pageSize };
    }
    one(id) {
        return this.svc.prisma.order.findUnique({
            where: { id },
            include: { items: true, address: true, user: true, statusHistory: true },
        });
    }
    async updateStatus(user, id, dto) {
        const before = await this.svc.prisma.order.findUnique({ where: { id } });
        if (!before)
            return { ok: false, message: 'Order not found' };
        await this.svc.prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id }, data: { status: dto.to } });
            await tx.orderStatusHistory.create({
                data: { orderId: id, from: before.status, to: dto.to, note: dto.note, actorId: user.userId },
            });
        });
        this.logger.log({ msg: 'Order status updated', orderId: id, from: before.status, to: dto.to, actorId: user.userId });
        return { ok: true };
    }
};
exports.AdminOrdersController = AdminOrdersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['PENDING', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED'] }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false, description: 'ISO date' }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false, description: 'ISO date' }),
    (0, swagger_1.ApiQuery)({ name: 'customer', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'minTotalCents', required: false, schema: { type: 'integer' } }),
    (0, swagger_1.ApiQuery)({ name: 'maxTotalCents', required: false, schema: { type: 'integer' } }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated orders with filters' }),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('customer')),
    __param(4, (0, common_1.Query)('minTotalCents')),
    __param(5, (0, common_1.Query)('maxTotalCents')),
    __param(6, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminOrdersController.prototype, "one", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, order_status_dto_1.UpdateOrderStatusDto]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "updateStatus", null);
exports.AdminOrdersController = AdminOrdersController = AdminOrdersController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin/Orders'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/orders', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminOrdersController);
//# sourceMappingURL=orders.controller.js.map