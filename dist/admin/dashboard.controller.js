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
exports.AdminDashboardController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const dashboard_dto_1 = require("./dto/dashboard.dto");
const client_1 = require("@prisma/client");
let AdminDashboardController = class AdminDashboardController {
    constructor(svc) {
        this.svc = svc;
    }
    async summary(range) {
        const whereDate = {};
        if (range.from || range.to)
            whereDate.createdAt = {};
        if (range.from)
            whereDate.createdAt.gte = new Date(range.from);
        if (range.to)
            whereDate.createdAt.lte = new Date(range.to);
        const kpiWhere = {
            ...(whereDate.createdAt ? { createdAt: whereDate.createdAt } : {}),
            status: { in: ['DELIVERED', 'OUT_FOR_DELIVERY', 'PROCESSING', 'PENDING'] },
        };
        const [ordersForKpi, byStatus, recent, customersCount, lowStock, topRaw] = await this.svc.prisma.$transaction([
            this.svc.prisma.order.findMany({ where: kpiWhere, select: { totalCents: true } }),
            this.svc.prisma.order.groupBy({
                by: ['status'],
                _count: { status: true },
                where: whereDate.createdAt ? { createdAt: whereDate.createdAt } : undefined,
                orderBy: { status: 'asc' },
            }),
            this.svc.prisma.order.findMany({
                where: whereDate.createdAt ? { createdAt: whereDate.createdAt } : undefined,
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    totalCents: true,
                    status: true,
                    createdAt: true,
                    user: { select: { name: true, phone: true } },
                },
            }),
            this.svc.prisma.user.count(),
            this.svc.prisma.product.findMany({
                where: { stock: { lt: 10 }, status: 'ACTIVE' },
                select: { id: true, name: true, stock: true },
                orderBy: { stock: 'asc' },
                take: 10,
            }),
            this.svc.prisma.orderItem.groupBy({ by: ['productId'], _sum: { qty: true }, orderBy: { _sum: { qty: 'desc' } }, take: 10 }),
        ]);
        const totalRevenueCents = ordersForKpi.reduce((s, o) => s + o.totalCents, 0);
        const totalOrders = ordersForKpi.length;
        const avgOrderValueCents = totalOrders ? Math.round(totalRevenueCents / totalOrders) : 0;
        const productIds = topRaw.map((t) => t.productId);
        const products = await this.svc.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
        });
        const topProducts = topRaw.map((tr) => ({
            productId: tr.productId,
            qty: tr._sum?.qty ?? 0,
            name: products.find((p) => p.id === tr.productId)?.name,
        }));
        return {
            sales: { totalRevenueCents, totalOrders, avgOrderValueCents },
            byStatus,
            recent,
            topProducts,
            lowStock,
            customersCount,
        };
    }
    async timeSeries(q) {
        const gran = q.granularity ?? 'day';
        const from = q.from ? new Date(q.from) : undefined;
        const to = q.to ? new Date(q.to) : undefined;
        const whereClauses = [];
        if (from)
            whereClauses.push(client_1.Prisma.sql `"createdAt" >= ${from}`);
        if (to)
            whereClauses.push(client_1.Prisma.sql `"createdAt" <= ${to}`);
        whereClauses.push(client_1.Prisma.sql `"status" IN ('PENDING','PROCESSING','OUT_FOR_DELIVERY','DELIVERED')`);
        const whereSql = whereClauses.length > 0
            ? client_1.Prisma.sql `WHERE ${client_1.Prisma.join(whereClauses, ' AND ')}`
            : client_1.Prisma.empty;
        const granKey = gran === 'week' ? 'week' : gran === 'month' ? 'month' : 'day';
        const granSql = client_1.Prisma.sql `date_trunc(${client_1.Prisma.raw(`'${granKey}'`)}, "createdAt")`;
        const rows = await this.svc.prisma.$queryRaw(client_1.Prisma.sql `
      SELECT ${granSql} AS bucket,
             SUM("totalCents") AS revenuecents,
             COUNT(*) AS orders
      FROM "Order"
      ${whereSql}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
        return rows.map((r) => ({
            period: r.bucket.toISOString(),
            revenueCents: Number(r.revenuecents ?? 0),
            orders: Number(r.orders ?? 0),
        }));
    }
    async topProducts(range, lim) {
        const whereOrder = {};
        if (range.from || range.to)
            whereOrder.createdAt = {};
        if (range.from)
            whereOrder.createdAt.gte = new Date(range.from);
        if (range.to)
            whereOrder.createdAt.lte = new Date(range.to);
        whereOrder.status = { in: ['PENDING', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED'] };
        const topRaw = await this.svc.prisma.orderItem.groupBy({
            by: ['productId'],
            _sum: { qty: true },
            where: { order: { ...(whereOrder.createdAt ? { createdAt: whereOrder.createdAt } : {}), status: whereOrder.status } },
            orderBy: { _sum: { qty: 'desc' } },
            take: lim.limit,
        });
        const products = await this.svc.prisma.product.findMany({
            where: { id: { in: topRaw.map((t) => t.productId) } },
            select: { id: true, name: true },
        });
        return topRaw.map((t) => ({
            productId: t.productId,
            qty: t._sum.qty ?? 0,
            name: products.find((p) => p.id === t.productId)?.name,
        }));
    }
    async lowStock(thr) {
        return this.svc.prisma.product.findMany({
            where: { stock: { lt: thr.threshold ?? 10 }, status: 'ACTIVE' },
            select: { id: true, name: true, stock: true },
            orderBy: { stock: 'asc' },
        });
    }
    async statusBreakdown(range) {
        const where = {};
        if (range.from || range.to)
            where.createdAt = {};
        if (range.from)
            where.createdAt.gte = new Date(range.from);
        if (range.to)
            where.createdAt.lte = new Date(range.to);
        return this.svc.prisma.order.groupBy({
            by: ['status'],
            _count: { status: true },
            where: where.createdAt ? { createdAt: where.createdAt } : undefined,
        });
    }
};
exports.AdminDashboardController = AdminDashboardController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Sales Summary, status breakdown, recent orders, top products, low stock, customers count' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false, description: 'ISO date inclusive' }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false, description: 'ISO date inclusive' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_dto_1.RangeDto]),
    __metadata("design:returntype", Promise)
], AdminDashboardController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('timeseries'),
    (0, swagger_1.ApiOkResponse)({ description: 'Time series of revenue/order count' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_dto_1.TimeSeriesDto]),
    __metadata("design:returntype", Promise)
], AdminDashboardController.prototype, "timeSeries", null);
__decorate([
    (0, common_1.Get)('top-products'),
    (0, swagger_1.ApiOkResponse)({ description: 'Top products by quantity' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_dto_1.RangeDto, dashboard_dto_1.LimitDto]),
    __metadata("design:returntype", Promise)
], AdminDashboardController.prototype, "topProducts", null);
__decorate([
    (0, common_1.Get)('low-stock'),
    (0, swagger_1.ApiOkResponse)({ description: 'Products below threshold' }),
    (0, swagger_1.ApiQuery)({ name: 'threshold', required: false }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_dto_1.ThresholdDto]),
    __metadata("design:returntype", Promise)
], AdminDashboardController.prototype, "lowStock", null);
__decorate([
    (0, common_1.Get)('status-breakdown'),
    (0, swagger_1.ApiOkResponse)({ description: 'Count of orders per status for the range' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_dto_1.RangeDto]),
    __metadata("design:returntype", Promise)
], AdminDashboardController.prototype, "statusBreakdown", null);
exports.AdminDashboardController = AdminDashboardController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Dashboard'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/dashboard', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminDashboardController);
//# sourceMappingURL=dashboard.controller.js.map