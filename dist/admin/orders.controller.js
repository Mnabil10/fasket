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
const driver_dto_1 = require("../delivery-drivers/dto/driver.dto");
const notifications_service_1 = require("../notifications/notifications.service");
const receipt_service_1 = require("../orders/receipt.service");
const client_1 = require("@prisma/client");
const audit_log_service_1 = require("../common/audit/audit-log.service");
const orders_service_1 = require("../orders/orders.service");
let AdminOrdersController = AdminOrdersController_1 = class AdminOrdersController {
    constructor(svc, notifications, receipts, audit, orders) {
        this.svc = svc;
        this.notifications = notifications;
        this.receipts = receipts;
        this.audit = audit;
        this.orders = orders;
        this.logger = new common_1.Logger(AdminOrdersController_1.name);
    }
    async list(status, from, to, customer, minTotalCents, maxTotalCents, driverId, page) {
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
        if (driverId) {
            where.driverId = driverId;
        }
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, name: true, phone: true } },
                    driver: { select: { id: true, fullName: true, phone: true } },
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
            include: {
                items: true,
                address: true,
                user: true,
                statusHistory: true,
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        vehicle: { select: { type: true, plateNumber: true } },
                    },
                },
            },
        });
    }
    getReceipt(id) {
        return this.receipts.getForAdmin(id);
    }
    async updateStatus(user, id, dto) {
        const before = await this.svc.prisma.order.findUnique({ where: { id } });
        if (!before) {
            return { ok: false, message: 'Order not found' };
        }
        const nextStatus = dto.to;
        let loyaltyEarned = 0;
        await this.svc.prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id }, data: { status: nextStatus } });
            await tx.orderStatusHistory.create({
                data: { orderId: id, from: before.status, to: nextStatus, note: dto.note, actorId: user.userId },
            });
            if (nextStatus === client_1.OrderStatus.DELIVERED) {
                loyaltyEarned = await this.orders.awardLoyaltyForOrder(id, tx);
            }
        });
        const statusKey = nextStatus === client_1.OrderStatus.OUT_FOR_DELIVERY
            ? 'order_out_for_delivery'
            : nextStatus === client_1.OrderStatus.DELIVERED
                ? 'order_delivered'
                : nextStatus === client_1.OrderStatus.CANCELED
                    ? 'order_canceled'
                    : 'order_status_changed';
        await this.notifications.notify(statusKey, before.userId, { orderId: id, status: nextStatus });
        if (loyaltyEarned > 0) {
            await this.notifications.notify('loyalty_earned', before.userId, { orderId: id, points: loyaltyEarned });
        }
        await this.audit.log({
            action: 'order.status.change',
            entity: 'order',
            entityId: id,
            before: { status: before.status },
            after: { status: nextStatus, note: dto.note },
        });
        this.logger.log({ msg: 'Order status updated', orderId: id, from: before.status, to: dto.to, actorId: user.userId });
        return { ok: true };
    }
    async assignDriver(id, dto, admin) {
        const result = await this.orders.assignDriverToOrder(id, dto.driverId, admin.userId);
        this.logger.log({ msg: 'Driver assigned', orderId: id, driverId: result.driver.id });
        return { success: true, data: result };
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
    (0, swagger_1.ApiQuery)({ name: 'driverId', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated orders with filters' }),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('customer')),
    __param(4, (0, common_1.Query)('minTotalCents')),
    __param(5, (0, common_1.Query)('maxTotalCents')),
    __param(6, (0, common_1.Query)('driverId')),
    __param(7, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, pagination_dto_1.PaginationDto]),
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
    (0, common_1.Get)(':id/receipt'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminOrdersController.prototype, "getReceipt", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, order_status_dto_1.UpdateOrderStatusDto]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/assign-driver'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.AssignDriverDto, Object]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "assignDriver", null);
exports.AdminOrdersController = AdminOrdersController = AdminOrdersController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin/Orders'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/orders', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        notifications_service_1.NotificationsService,
        receipt_service_1.ReceiptService,
        audit_log_service_1.AuditLogService,
        orders_service_1.OrdersService])
], AdminOrdersController);
//# sourceMappingURL=orders.controller.js.map