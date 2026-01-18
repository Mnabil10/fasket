import { Injectable, Logger } from '@nestjs/common';
import { LedgerEntryType, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { CommissionConfigService } from './commission-config.service';
import { DomainError, ErrorCode } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly configs: CommissionConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPayout(
    params: {
      providerId: string;
      amountCents: number;
      feeCents?: number;
      referenceId?: string | null;
      requestedById?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    if (!params.amountCents || params.amountCents <= 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Payout amount must be greater than zero', 400);
    }

    await this.finance.releaseMaturedHolds(params.providerId, client);
    const { base } = await this.configs.resolveConfigs(params.providerId, [], client);
    const baseConfig = this.configs.resolveEffectiveBaseConfig(base);
    const minimum = baseConfig.minimumPayoutCents ?? 0;
    if (minimum > 0 && params.amountCents < minimum) {
      throw new DomainError(ErrorCode.PAYOUT_MINIMUM_NOT_MET, 'Payout amount is below minimum', 400);
    }

    const feeCents = Math.max(0, params.feeCents ?? 0);
    const balance = await this.finance.getProviderBalance(params.providerId, client);
    const totalDebit = params.amountCents + feeCents;
    if (balance.availableCents < totalDebit) {
      throw new DomainError(ErrorCode.PAYOUT_INSUFFICIENT_BALANCE, 'Insufficient available balance', 400);
    }

    const payout = await client.payout.create({
      data: {
        providerId: params.providerId,
        amountCents: params.amountCents,
        feeCents,
        currency: balance.currency ?? 'EGP',
        referenceId: params.referenceId ?? undefined,
        status: PayoutStatus.PENDING,
        requestedById: params.requestedById ?? undefined,
      },
    });

    await client.vendorBalance.update({
      where: { providerId: params.providerId },
      data: { availableCents: { decrement: totalDebit } },
    });

    await client.transactionLedger.create({
      data: {
        providerId: params.providerId,
        payoutId: payout.id,
        type: LedgerEntryType.PAYOUT,
        amountCents: -Math.abs(params.amountCents),
        currency: payout.currency,
        metadata: { feeCents },
      },
    });

    if (feeCents > 0) {
      await client.transactionLedger.create({
        data: {
          providerId: params.providerId,
          payoutId: payout.id,
          type: LedgerEntryType.PAYOUT_FEE,
          amountCents: -Math.abs(feeCents),
          currency: payout.currency,
        },
      });
    }

    return payout;
  }

  async updatePayoutStatus(
    payoutId: string,
    params: {
      status: PayoutStatus;
      processedById?: string | null;
      referenceId?: string | null;
      failureReason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const existing = await client.payout.findUnique({ where: { id: payoutId } });
    if (!existing) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Payout not found', 404);
    }
    if (existing.status === PayoutStatus.PAID) {
      throw new DomainError(ErrorCode.PAYOUT_INVALID_STATUS, 'Payout already paid', 400);
    }

    const now = new Date();
    const nextStatus = params.status;

    if (nextStatus === PayoutStatus.FAILED && existing.status !== PayoutStatus.FAILED) {
      const refund = Math.abs(existing.amountCents + (existing.feeCents ?? 0));
      await client.vendorBalance.update({
        where: { providerId: existing.providerId },
        data: { availableCents: { increment: refund } },
      });
      await client.transactionLedger.create({
        data: {
          providerId: existing.providerId,
          payoutId: existing.id,
          type: LedgerEntryType.PAYOUT_REVERSAL,
          amountCents: refund,
          currency: existing.currency ?? 'EGP',
          metadata: { reason: params.failureReason ?? 'payout.failed' },
        },
      });
      await this.notifications.notifyAdminEvent({
        title: 'Payment failure',
        body: `Payout ${existing.id} failed for provider ${existing.providerId}.`,
        type: 'payment_failure',
        data: {
          payoutId: existing.id,
          providerId: existing.providerId,
          amountCents: existing.amountCents,
          currency: existing.currency ?? 'EGP',
          reason: params.failureReason ?? null,
        },
      });
    }

    if (nextStatus === PayoutStatus.PAID) {
      await client.vendorBalance.update({
        where: { providerId: existing.providerId },
        data: { lastPayoutAt: now },
      });
    }

    const updated = await client.payout.update({
      where: { id: payoutId },
      data: {
        status: nextStatus,
        processedById: params.processedById ?? undefined,
        processedAt: nextStatus === PayoutStatus.PENDING ? undefined : now,
        referenceId: params.referenceId ?? existing.referenceId ?? undefined,
        failureReason: params.failureReason ?? undefined,
      },
    });

    this.logger.log({ msg: 'Payout status updated', payoutId, status: nextStatus });
    return updated;
  }

  async runScheduledPayouts(params: { minimumOverrideCents?: number } = {}) {
    const providers = await this.prisma.vendorBalance.findMany({
      where: { availableCents: { gt: 0 } },
      select: { providerId: true, availableCents: true },
    });
    const results: Array<{ providerId: string; payoutId?: string; skipped?: string }> = [];
    for (const provider of providers) {
      try {
        const payout = await this.createPayout({
          providerId: provider.providerId,
          amountCents: provider.availableCents,
          feeCents: 0,
        });
        results.push({ providerId: provider.providerId, payoutId: payout.id });
      } catch (err: any) {
        const reason = err?.message ?? 'skipped';
        results.push({ providerId: provider.providerId, skipped: reason });
      }
    }
    return results;
  }
}
