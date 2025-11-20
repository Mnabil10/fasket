import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { DomainError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

interface RedeemParams {
  userId: string;
  pointsToRedeem: number;
  subtotalCents: number;
  tx: Prisma.TransactionClient;
  orderId?: string;
}

interface AwardParams {
  userId: string;
  subtotalCents: number;
  tx: Prisma.TransactionClient;
  orderId?: string;
}

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async redeemPoints(params: RedeemParams): Promise<{ pointsUsed: number; discountCents: number }> {
    if (!params.pointsToRedeem || params.pointsToRedeem <= 0) {
      return { pointsUsed: 0, discountCents: 0 };
    }
    const config = await this.settings.getLoyaltyConfig();
    if (!config.enabled) {
      throw new DomainError(ErrorCode.LOYALTY_DISABLED, 'Loyalty program is not enabled');
    }
    if (config.redeemRate <= 0 || config.redeemUnitCents <= 0 || config.redeemRateValue <= 0) {
      throw new DomainError(ErrorCode.LOYALTY_RULE_VIOLATION, 'Redeem rules are not configured');
    }
    const requestedPoints = Math.floor(params.pointsToRedeem);
    if (requestedPoints < config.minRedeemPoints) {
      throw new DomainError(
        ErrorCode.LOYALTY_RULE_VIOLATION,
        `You need at least ${config.minRedeemPoints} points to redeem`,
      );
    }
    if (config.maxRedeemPerOrder && requestedPoints > config.maxRedeemPerOrder) {
      throw new DomainError(
        ErrorCode.LOYALTY_RULE_VIOLATION,
        `You can redeem up to ${config.maxRedeemPerOrder} points per order`,
      );
    }
    const user = await params.tx.user.findUnique({
      where: { id: params.userId },
      select: { loyaltyPoints: true },
    });
    if (!user || user.loyaltyPoints < requestedPoints) {
      throw new DomainError(ErrorCode.LOYALTY_NOT_ENOUGH_POINTS, 'Not enough loyalty points to redeem');
    }
    const maxRedeemablePoints = Math.min(requestedPoints, user.loyaltyPoints);
    let discountCents = Math.floor(maxRedeemablePoints * config.redeemRateValue * 100);
    if (discountCents <= 0) {
      throw new DomainError(ErrorCode.LOYALTY_RULE_VIOLATION, 'Not enough points to redeem a reward');
    }
    const maxDiscountFromPercent =
      config.maxDiscountPercent > 0
        ? Math.floor((params.subtotalCents * config.maxDiscountPercent) / 100)
        : params.subtotalCents;
    if (discountCents > maxDiscountFromPercent) {
      discountCents = maxDiscountFromPercent;
    }
    discountCents = Math.min(discountCents, params.subtotalCents);
    const pointsUsed = Math.min(maxRedeemablePoints, Math.floor(discountCents / (config.redeemRateValue * 100)));
    if (pointsUsed <= 0 || discountCents <= 0) {
      return { pointsUsed: 0, discountCents: 0 };
    }

    await params.tx.user.update({
      where: { id: params.userId },
      data: { loyaltyPoints: { decrement: pointsUsed } },
    });
    await params.tx.loyaltyTransaction.create({
      data: {
        userId: params.userId,
        orderId: params.orderId,
        type: 'REDEEM',
        points: pointsUsed,
        metadata: { discountCents },
      },
    });
    return { pointsUsed, discountCents };
  }

  async awardPoints(params: AwardParams): Promise<number> {
    if (params.subtotalCents <= 0) return 0;
    const config = await this.settings.getLoyaltyConfig();
    if (!config.enabled || config.earnRate <= 0) {
      return 0;
    }
    const points = Math.floor((params.subtotalCents / 100) * config.earnRate);
    if (points <= 0) {
      return 0;
    }

    const cycle = await this.ensureCycle(params.userId, config.resetThreshold, params.tx);

    await params.tx.user.update({
      where: { id: params.userId },
      data: { loyaltyPoints: { increment: points } },
    });
    await params.tx.loyaltyTransaction.create({
      data: {
        userId: params.userId,
        orderId: params.orderId,
        type: 'EARN',
        points,
        metadata: { subtotalCents: params.subtotalCents },
        cycleId: cycle?.id,
      },
    });

    if (cycle && config.resetThreshold > 0 && cycle.earnedInCycle + points >= config.resetThreshold) {
      await params.tx.loyaltyCycle.update({
        where: { id: cycle.id },
        data: {
          earnedInCycle: { increment: points },
          completedAt: new Date(),
        },
      });
      if (cycle.resetOnComplete) {
        await params.tx.user.update({
          where: { id: params.userId },
          data: { loyaltyPoints: 0 },
        });
      }
    } else if (cycle) {
      await params.tx.loyaltyCycle.update({
        where: { id: cycle.id },
        data: { earnedInCycle: { increment: points } },
      });
    }

    return points;
  }

  async getUserSummary(userId: string, options?: { historyLimit?: number }) {
    const limit = Math.max(1, Math.min(options?.historyLimit ?? 20, 50));
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, loyaltyPoints: true },
    });
    if (!user) {
      throw new DomainError(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        points: true,
        orderId: true,
        metadata: true,
        createdAt: true,
      },
    });
    return {
      userId,
      balance: user.loyaltyPoints,
      recentTransactions: transactions.map((txn) => ({
        id: txn.id,
        type: txn.type,
        points: txn.points,
        orderId: txn.orderId ?? undefined,
        metadata: txn.metadata ?? undefined,
        createdAt: txn.createdAt,
      })),
    };
  }

  async getAdminSummary(userId: string, options?: { historyLimit?: number }) {
    const limit = Math.max(1, Math.min(options?.historyLimit ?? 50, 200));
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, loyaltyPoints: true },
    });
    if (!user) {
      throw new DomainError(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    const [transactions, aggregates] = await this.prisma.$transaction([
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          points: true,
          orderId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.loyaltyTransaction.groupBy({
        where: { userId },
        by: ['type'],
        orderBy: { type: 'asc' },
        _sum: { points: true },
      }),
    ]);
    const totals = {
      earned: 0,
      redeemed: 0,
      adjusted: 0,
    };
    for (const aggregate of aggregates) {
      const value = aggregate._sum?.points ?? 0;
      switch (aggregate.type) {
        case 'EARN':
          totals.earned += value;
          break;
        case 'REDEEM':
          totals.redeemed += value;
          break;
        case 'ADJUST':
          totals.adjusted += value;
          break;
        default:
          break;
      }
    }
    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
      },
      balance: user.loyaltyPoints,
      totals,
      transactions: transactions.map((txn) => ({
        id: txn.id,
        type: txn.type,
        points: txn.points,
        orderId: txn.orderId ?? undefined,
        metadata: txn.metadata ?? undefined,
        createdAt: txn.createdAt,
      })),
    };
  }

  async adjustUserPoints(params: {
    userId: string;
    points: number;
    reason: string;
    actorId?: string;
    metadata?: Record<string, any>;
  }) {
    const points = Math.trunc(params.points);
    if (!Number.isFinite(points) || points === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Points adjustment must be a non-zero integer');
    }
    if (!params.reason?.trim()) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Adjustment reason is required');
    }
    const { user, transaction } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: params.userId },
        select: { id: true, loyaltyPoints: true },
      });
      if (!user) {
        throw new DomainError(ErrorCode.USER_NOT_FOUND, 'User not found');
      }
      const nextBalance = user.loyaltyPoints + points;
      if (nextBalance < 0) {
        throw new DomainError(
          ErrorCode.LOYALTY_RULE_VIOLATION,
          'Adjustment would reduce loyalty balance below zero',
        );
      }
      const updated = await tx.user.update({
        where: { id: params.userId },
        data: { loyaltyPoints: nextBalance },
        select: { id: true, loyaltyPoints: true },
      });
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          userId: params.userId,
          type: 'ADJUST',
          points,
          metadata: {
            ...(params.metadata ?? {}),
            reason: params.reason,
            actorId: params.actorId,
          },
        },
      });
      return { user: updated, transaction };
    });
    return {
      balance: user.loyaltyPoints,
      transaction,
    };
  }

  private async ensureCycle(userId: string, threshold: number, tx: Prisma.TransactionClient) {
    if (!threshold || threshold <= 0) return undefined;
    const existing = await tx.loyaltyCycle.findFirst({
      where: { userId, completedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return existing;
    return tx.loyaltyCycle.create({
      data: {
        userId,
        threshold,
        resetOnComplete: true,
      },
    });
  }
}
