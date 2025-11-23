import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { UpdateLoyaltySettingsDto } from './dto/loyalty-settings.dto';
import { SettingsService } from '../settings/settings.service';
import { AdminService } from './admin.service';
import { AdjustPointsDto } from './dto/loyalty-adjust.dto';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { LoyaltyTransactionsQueryDto } from './dto/loyalty-transactions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Admin/Loyalty')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/loyalty', version: ['1'] })
export class AdminLoyaltyController {
  constructor(
    private readonly settings: SettingsService,
    private readonly admin: AdminService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // ---- Settings ----
  @Get('settings')
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

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateLoyaltySettingsDto, @CurrentUser() adminUser: CurrentUserPayload) {
    const currentSettings = await this.settings.getSettings();
    const before = await this.settings.getLoyaltyConfig();

    const loyaltyEnabled = dto.loyaltyEnabled ?? currentSettings.loyaltyEnabled ?? false;
    const earnRate = dto.earnRate ?? before.earnRate ?? 0;
    const redeemRateValue = dto.redeemRateValue ?? before.redeemRateValue ?? 0;
    if (loyaltyEnabled && (earnRate <= 0 || redeemRateValue <= 0)) {
      throw new BadRequestException('earnRate and redeemRateValue must be greater than 0 when loyalty is enabled');
    }

    const data: any = {
      loyaltyEnabled,
      loyaltyEarnRate: earnRate,
      loyaltyRedeemRateValue: redeemRateValue,
      loyaltyMinRedeemPoints: dto.minRedeemPoints ?? currentSettings.loyaltyMinRedeemPoints ?? 0,
      loyaltyMaxRedeemPerOrder: dto.maxRedeemPerOrder ?? currentSettings.loyaltyMaxRedeemPerOrder ?? 0,
      loyaltyMaxDiscountPercent: dto.maxDiscountPercent ?? currentSettings.loyaltyMaxDiscountPercent ?? 0,
      loyaltyResetThreshold: dto.resetThreshold ?? currentSettings.loyaltyResetThreshold ?? 0,
      // Legacy compatibility fields
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

  // ---- Adjust points ----
  @Post('users/:userId/adjust')
  async adjustPoints(@CurrentUser() adminUser: CurrentUserPayload, @Param('userId') userId: string, @Body() dto: AdjustPointsDto) {
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

  // ---- User view ----
  @Get('users/:userId')
  async userSummary(@Param('userId') userId: string) {
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

  @Get('users/:userId/transactions')
  @ApiQuery({ name: 'type', required: false, enum: ['EARN', 'REDEEM', 'ADJUST'] })
  async userTransactions(@Param('userId') userId: string, @Query() query: LoyaltyTransactionsQueryDto) {
    const where: any = { userId };
    if (query.type) where.type = query.type;
    if (query.orderId) where.orderId = query.orderId;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
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

  // ---- Global transactions ----
  @Get('transactions')
  @ApiQuery({ name: 'type', required: false, enum: ['EARN', 'REDEEM', 'ADJUST'] })
  async transactions(@Query() query: LoyaltyTransactionsQueryDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type;
    if (query.orderId) where.orderId = query.orderId;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
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

  @Get('transactions/summary')
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
      if (row.type === 'EARN') totals.earned += points;
      if (row.type === 'REDEEM') totals.redeemed += points;
      if (row.type === 'ADJUST') totals.adjusted += points;
    }
    return {
      totalUsersWithPoints: usersWithPoints,
      totalOutstandingPoints: userAgg._sum.loyaltyPoints ?? 0,
      totalEarnedPoints: totals.earned,
      totalRedeemedPoints: totals.redeemed,
      totalAdjustedPoints: totals.adjusted,
    };
  }
}
