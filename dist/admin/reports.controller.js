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
exports.AdminReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminReportsController = class AdminReportsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async daily(date) {
        const target = date ? new Date(date) : new Date();
        const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return this.computeRange({ from: start, to: end });
    }
    async range(from, to) {
        if (!from || !to) {
            throw new common_1.BadRequestException('from and to are required');
        }
        const start = new Date(from);
        const end = new Date(to);
        return this.computeRange({ from: start, to: end });
    }
    async export(from, to, format = 'csv', res) {
        if (!from || !to) {
            throw new common_1.BadRequestException('from and to are required');
        }
        if (format && format.toLowerCase() !== 'csv') {
            throw new common_1.BadRequestException('Only CSV export is supported');
        }
        const maxRangeDays = Number(process.env.PROFIT_EXPORT_MAX_DAYS ?? 90);
        const startDate = new Date(from);
        const endDate = new Date(to);
        const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > maxRangeDays) {
            throw new common_1.BadRequestException(`Date range too large. Max ${maxRangeDays} days`);
        }
        format = 'csv';
        const start = startDate;
        const end = endDate;
        const data = await this.computeRange({ from: start, to: end });
        const rows = [
            ['date', 'orders', 'salesCents', 'discountCents', 'deliveryFeeCents', 'netRevenueCents', 'cogsCents', 'grossProfitCents', 'grossMarginPct', 'missingCostCount'],
            [
                data.date,
                data.ordersCount,
                data.salesCents,
                data.discountCents,
                data.deliveryFeeCents,
                data.netRevenueCents,
                data.cogsCents,
                data.grossProfitCents,
                data.grossMarginPct,
                data.missingCostCount,
            ],
        ];
        const csv = rows.map((r) => r.join(',')).join('\n');
        const ext = format === 'xlsx' ? 'xlsx' : 'csv';
        const filename = `profit_${from}_${to}.${ext}`;
        res.setHeader('Content-Type', ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    }
    async computeRange(window) {
        const orders = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: window.from, lt: window.to },
                status: { not: 'CANCELED' },
            },
            select: {
                id: true,
                discountCents: true,
                loyaltyDiscountCents: true,
                shippingFeeCents: true,
                items: {
                    select: { qty: true, unitPriceCents: true, unitCostCents: true, priceSnapshotCents: true },
                },
            },
        });
        let salesCents = 0;
        let discountCents = 0;
        let deliveryFeeCents = 0;
        let cogsCents = 0;
        let missingCostCount = 0;
        for (const order of orders) {
            let itemsTotal = 0;
            let itemsCost = 0;
            for (const item of order.items) {
                const price = item.unitPriceCents || item.priceSnapshotCents || 0;
                const cost = item.unitCostCents || 0;
                if (!item.unitCostCents || item.unitCostCents <= 0) {
                    missingCostCount += 1;
                }
                itemsTotal += price * item.qty;
                itemsCost += cost * item.qty;
            }
            salesCents += itemsTotal;
            discountCents += (order.discountCents ?? 0) + (order.loyaltyDiscountCents ?? 0);
            deliveryFeeCents += order.shippingFeeCents ?? 0;
            cogsCents += itemsCost;
        }
        const netRevenueCents = Math.max(0, salesCents - discountCents) + deliveryFeeCents;
        const grossProfitCents = netRevenueCents - cogsCents;
        const grossMarginPct = netRevenueCents > 0 ? (grossProfitCents / netRevenueCents) * 100 : 0;
        return {
            date: window.from.toISOString().slice(0, 10),
            ordersCount: orders.length,
            salesCents,
            discountCents,
            deliveryFeeCents,
            netRevenueCents,
            cogsCents,
            grossProfitCents,
            grossMarginPct: Number(grossMarginPct.toFixed(2)),
            missingCostCount,
        };
    }
};
exports.AdminReportsController = AdminReportsController;
__decorate([
    (0, common_1.Get)('profit/daily'),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminReportsController.prototype, "daily", null);
__decorate([
    (0, common_1.Get)('profit/range'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminReportsController.prototype, "range", null);
__decorate([
    (0, common_1.Get)('profit/export'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('format')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminReportsController.prototype, "export", null);
exports.AdminReportsController = AdminReportsController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Reports'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/reports', version: ['1'] }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminReportsController);
//# sourceMappingURL=reports.controller.js.map