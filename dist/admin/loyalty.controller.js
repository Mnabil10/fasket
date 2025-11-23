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
exports.AdminLoyaltyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const loyalty_settings_dto_1 = require("./dto/loyalty-settings.dto");
const settings_service_1 = require("../settings/settings.service");
const admin_service_1 = require("./admin.service");
const loyalty_adjust_dto_1 = require("./dto/loyalty-adjust.dto");
const loyalty_service_1 = require("../loyalty/loyalty.service");
const loyalty_transactions_dto_1 = require("./dto/loyalty-transactions.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AdminLoyaltyController = class AdminLoyaltyController {
    constructor(settings, admin, loyalty) {
        this.settings = settings;
        this.admin = admin;
        this.loyalty = loyalty;
    }
    async getSettings() {
        const config = await this.settings.getLoyaltyConfig();
        return {
            loyaltyEnabled: config.enabled,
            earnRate: config.earnRate,
            redeemRateValue: config.redeemRateValue,
            minRedeemPoints: config.minRedeemPoints,
            maxRedeemPerOrder: config.maxRedeemPerOrder,
            maxDiscountPercent: config.maxDiscountPercent,
            resetThreshold: config.resetThreshold,
        };
    }
    async updateSettings(dto, adminUser) {
        const currentSettings = await this.settings.getSettings();
        const before = await this.settings.getLoyaltyConfig();
        const loyaltyEnabled = dto.loyaltyEnabled ?? currentSettings.loyaltyEnabled ?? false;
        const earnRate = dto.earnRate ?? before.earnRate ?? 0;
        const redeemRateValue = dto.redeemRateValue ?? before.redeemRateValue ?? 0;
        if (loyaltyEnabled && (earnRate <= 0 || redeemRateValue <= 0)) {
            throw new common_1.BadRequestException('earnRate and redeemRateValue must be greater than 0 when loyalty is enabled');
        }
        const data = {
            loyaltyEnabled,
            loyaltyEarnRate: earnRate,
            loyaltyRedeemRateValue: redeemRateValue,
            loyaltyMinRedeemPoints: dto.minRedeemPoints ?? currentSettings.loyaltyMinRedeemPoints ?? 0,
            loyaltyMaxRedeemPerOrder: dto.maxRedeemPerOrder ?? currentSettings.loyaltyMaxRedeemPerOrder ?? 0,
            loyaltyMaxDiscountPercent: dto.maxDiscountPercent ?? currentSettings.loyaltyMaxDiscountPercent ?? 0,
            loyaltyResetThreshold: dto.resetThreshold ?? currentSettings.loyaltyResetThreshold ?? 0,
            loyaltyEarnPoints: Math.round(earnRate * 100),
            loyaltyEarnPerCents: 100,
            loyaltyRedeemRate: 1,
            loyaltyRedeemUnitCents: Math.round(redeemRateValue * 100),
        };
        await this.admin.prisma.setting.update({
            where: { id: currentSettings.id },
            data,
        });
        await this.settings.clearCache();
        const after = await this.settings.getLoyaltyConfig();
        await this.admin.audit.log({
            action: 'loyalty.settings.update',
            entity: 'settings',
            entityId: currentSettings.id,
            before,
            after,
            actorId: adminUser?.userId,
        });
        return {
            loyaltyEnabled: after.enabled,
            earnRate: after.earnRate,
            redeemRateValue: after.redeemRateValue,
            minRedeemPoints: after.minRedeemPoints,
            maxRedeemPerOrder: after.maxRedeemPerOrder,
            maxDiscountPercent: after.maxDiscountPercent,
            resetThreshold: after.resetThreshold,
        };
    }
    async adjustPoints(adminUser, userId, dto) {
        const result = await this.loyalty.adjustUserPoints({
            userId,
            points: dto.points,
            reason: dto.reason,
            actorId: adminUser?.userId,
            metadata: { adminAction: true, orderId: dto.orderId, reason: dto.reason, actorId: adminUser?.userId },
        });
        await this.admin.audit.log({
            action: 'loyalty.adjust',
            entity: 'user',
            entityId: userId,
            before: null,
            after: { delta: dto.points, reason: dto.reason, orderId: dto.orderId },
            actorId: adminUser?.userId,
        });
        return { balance: result.balance, transaction: result.transaction };
    }
    async userSummary(userId) {
        const summary = await this.loyalty.getAdminSummary(userId, { historyLimit: 0 });
        return {
            userId: summary.user.id,
            name: summary.user.name,
            email: summary.user.email,
            phone: summary.user.phone,
            balance: summary.balance,
            totalEarned: summary.totals.earned,
            totalRedeemed: summary.totals.redeemed,
            totalAdjusted: summary.totals.adjusted,
        };
    }
    async userTransactions(userId, query) {
        const where = { userId };
        if (query.type)
            where.type = query.type;
        if (query.orderId)
            where.orderId = query.orderId;
        if (query.fromDate || query.toDate) {
            where.createdAt = {};
            if (query.fromDate)
                where.createdAt.gte = new Date(query.fromDate);
            if (query.toDate)
                where.createdAt.lte = new Date(query.toDate);
        }
        const [items, total] = await this.admin.prisma.$transaction([
            this.admin.prisma.loyaltyTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: query.skip,
                take: query.take,
            }),
            this.admin.prisma.loyaltyTransaction.count({ where }),
        ]);
        return { items, total, page: query.page, pageSize: query.pageSize };
    }
    async transactions(query) {
        const where = {};
        if (query.userId)
            where.userId = query.userId;
        if (query.type)
            where.type = query.type;
        if (query.orderId)
            where.orderId = query.orderId;
        if (query.fromDate || query.toDate) {
            where.createdAt = {};
            if (query.fromDate)
                where.createdAt.gte = new Date(query.fromDate);
            if (query.toDate)
                where.createdAt.lte = new Date(query.toDate);
        }
        const [items, total] = await this.admin.prisma.$transaction([
            this.admin.prisma.loyaltyTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: query.skip,
                take: query.take,
                include: {
                    user: { select: { id: true, name: true, phone: true, email: true } },
                },
            }),
            this.admin.prisma.loyaltyTransaction.count({ where }),
        ]);
        return {
            items: items.map((txn) => ({
                id: txn.id,
                type: txn.type,
                points: txn.points,
                orderId: txn.orderId,
                user: txn.user,
                metadata: txn.metadata,
                createdAt: txn.createdAt,
            })),
            total,
            page: query.page,
            pageSize: query.pageSize,
        };
    }
    async transactionsSummary() {
        const [usersWithPoints, userAgg, txnAgg] = await this.admin.prisma.$transaction([
            this.admin.prisma.user.count({ where: { loyaltyPoints: { gt: 0 } } }),
            this.admin.prisma.user.aggregate({ _sum: { loyaltyPoints: true } }),
            this.admin.prisma.loyaltyTransaction.groupBy({
                by: ['type'],
                orderBy: { type: 'asc' },
                _sum: { points: true },
            }),
        ]);
        const totals = { earned: 0, redeemed: 0, adjusted: 0 };
        for (const row of txnAgg) {
            const points = (row._sum?.points ?? 0);
            if (row.type === 'EARN')
                totals.earned += points;
            if (row.type === 'REDEEM')
                totals.redeemed += points;
            if (row.type === 'ADJUST')
                totals.adjusted += points;
        }
        return {
            totalUsersWithPoints: usersWithPoints,
            totalOutstandingPoints: userAgg._sum.loyaltyPoints ?? 0,
            totalEarnedPoints: totals.earned,
            totalRedeemedPoints: totals.redeemed,
            totalAdjustedPoints: totals.adjusted,
        };
    }
};
exports.AdminLoyaltyController = AdminLoyaltyController;
__decorate([
    (0, common_1.Get)('settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)('settings'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [loyalty_settings_dto_1.UpdateLoyaltySettingsDto, Object]),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Post)('users/:userId/adjust'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, loyalty_adjust_dto_1.AdjustPointsDto]),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "adjustPoints", null);
__decorate([
    (0, common_1.Get)('users/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "userSummary", null);
__decorate([
    (0, common_1.Get)('users/:userId/transactions'),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, enum: ['EARN', 'REDEEM', 'ADJUST'] }),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, loyalty_transactions_dto_1.LoyaltyTransactionsQueryDto]),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "userTransactions", null);
__decorate([
    (0, common_1.Get)('transactions'),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, enum: ['EARN', 'REDEEM', 'ADJUST'] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [loyalty_transactions_dto_1.LoyaltyTransactionsQueryDto]),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "transactions", null);
__decorate([
    (0, common_1.Get)('transactions/summary'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminLoyaltyController.prototype, "transactionsSummary", null);
exports.AdminLoyaltyController = AdminLoyaltyController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Loyalty'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/loyalty', version: ['1'] }),
    __metadata("design:paramtypes", [settings_service_1.SettingsService,
        admin_service_1.AdminService,
        loyalty_service_1.LoyaltyService])
], AdminLoyaltyController);
//# sourceMappingURL=loyalty.controller.js.map