import { LedgerEntryType, PayoutStatus } from '@prisma/client';
import { PayoutsService } from './payouts.service';
import { FinanceService } from './finance.service';
import { CommissionConfigService } from './commission-config.service';
import { DomainError } from '../common/errors';

describe('PayoutsService', () => {
  const buildService = () => {
    const prisma = {
      payout: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      vendorBalance: { update: jest.fn(), findMany: jest.fn() },
      transactionLedger: { create: jest.fn() },
    } as any;

    const finance = {
      releaseMaturedHolds: jest.fn(),
      getProviderBalance: jest.fn(),
    } as unknown as FinanceService;

    const configs = {
      resolveConfigs: jest.fn().mockResolvedValue({ base: { minimumPayoutCents: 0 }, categoryOverrides: new Map() }),
      resolveEffectiveBaseConfig: jest.fn().mockReturnValue({ minimumPayoutCents: 0 }),
    } as unknown as CommissionConfigService;

    const service = new PayoutsService(prisma, finance, configs);
    return { service, prisma, finance, configs };
  };

  it('throws when balance is insufficient', async () => {
    const { service, finance } = buildService();
    finance.getProviderBalance = jest.fn().mockResolvedValue({ availableCents: 100, currency: 'EGP' });

    await expect(
      service.createPayout({ providerId: 'prov-1', amountCents: 200 }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('enforces minimum payout amount', async () => {
    const { service, finance, configs } = buildService();
    finance.getProviderBalance = jest.fn().mockResolvedValue({ availableCents: 1000, currency: 'EGP' });
    configs.resolveConfigs = jest.fn().mockResolvedValue({ base: { minimumPayoutCents: 500 }, categoryOverrides: new Map() });
    configs.resolveEffectiveBaseConfig = jest.fn().mockReturnValue({ minimumPayoutCents: 500 });

    await expect(
      service.createPayout({ providerId: 'prov-1', amountCents: 200 }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('creates payout ledger entries and debits balance', async () => {
    const { service, finance, prisma } = buildService();
    finance.getProviderBalance = jest.fn().mockResolvedValue({ availableCents: 10000, currency: 'EGP' });
    prisma.payout.create.mockResolvedValue({ id: 'p-1', currency: 'EGP' });

    await service.createPayout({ providerId: 'prov-1', amountCents: 5000, feeCents: 1000 });

    expect(prisma.vendorBalance.update).toHaveBeenCalledWith({
      where: { providerId: 'prov-1' },
      data: { availableCents: { decrement: 6000 } },
    });
    expect(prisma.transactionLedger.create).toHaveBeenCalledTimes(2);
  });

  it('blocks status updates when payout already paid', async () => {
    const { service, prisma } = buildService();
    prisma.payout.findUnique.mockResolvedValue({ id: 'p-1', status: PayoutStatus.PAID, providerId: 'prov-1', amountCents: 100, feeCents: 0, currency: 'EGP' });

    await expect(
      service.updatePayoutStatus('p-1', { status: PayoutStatus.PAID }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('refunds vendor balance on failed payout', async () => {
    const { service, prisma } = buildService();
    prisma.payout.findUnique.mockResolvedValue({
      id: 'p-2',
      status: PayoutStatus.PENDING,
      providerId: 'prov-1',
      amountCents: 1000,
      feeCents: 100,
      currency: 'EGP',
    });
    prisma.payout.update.mockResolvedValue({ id: 'p-2', status: PayoutStatus.FAILED });

    await service.updatePayoutStatus('p-2', { status: PayoutStatus.FAILED, failureReason: 'bank' });

    expect(prisma.vendorBalance.update).toHaveBeenCalledWith({
      where: { providerId: 'prov-1' },
      data: { availableCents: { increment: 1100 } },
    });
    expect(prisma.transactionLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: LedgerEntryType.PAYOUT_REVERSAL }),
      }),
    );
  });
});
