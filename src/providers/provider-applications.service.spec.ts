import { DeliveryMode, ProviderApplicationStatus, ProviderStatus, ProviderType, SubscriptionStatus } from '@prisma/client';
import { ProviderApplicationsService } from './provider-applications.service';

describe('ProviderApplicationsService', () => {
  const buildService = () => {
    const prisma = {
      providerApplication: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      plan: { findUnique: jest.fn() },
      provider: { update: jest.fn(), create: jest.fn() },
      branch: { updateMany: jest.fn(), create: jest.fn() },
      providerSubscription: { updateMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    } as any;

    const automation = { emit: jest.fn(), enqueueMany: jest.fn() } as any;
    const slugs = { generateUniqueSlug: jest.fn() } as any;
    const audit = { log: jest.fn() } as any;

    const service = new ProviderApplicationsService(prisma, automation, slugs, audit);
    return { service, prisma, automation, slugs, audit };
  };

  it('creates provider application and emits automation event', async () => {
    const { service, prisma, automation } = buildService();
    const created = {
      id: 'app-1',
      businessName: 'Store',
      providerType: ProviderType.SUPERMARKET,
      city: 'City',
      region: 'Region',
      ownerName: 'Owner',
      phone: '0100',
      email: 'a@b.com',
      deliveryMode: DeliveryMode.PLATFORM,
      notes: null,
      status: ProviderApplicationStatus.PENDING,
      providerId: null,
      rejectionReason: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.providerApplication.create.mockResolvedValue(created);
    automation.emit.mockResolvedValue({ id: 'evt-1' });

    const result = await service.createApplication({
      businessName: 'Store',
      providerType: ProviderType.SUPERMARKET,
      city: 'City',
      region: 'Region',
      ownerName: 'Owner',
      phone: '0100',
      email: 'a@b.com',
      deliveryMode: DeliveryMode.PLATFORM,
      notes: null,
    });

    expect(result).toEqual(created);
    expect(automation.emit).toHaveBeenCalledWith(
      'provider.application_submitted',
      expect.objectContaining({ application_id: 'app-1' }),
      expect.objectContaining({ dedupeKey: 'provider_application:app-1:submitted' }),
    );
    expect(automation.enqueueMany).toHaveBeenCalledWith([{ id: 'evt-1' }]);
  });

  it('approves application, creates provider, branch, subscription, and emits events', async () => {
    const { service, prisma, automation, slugs } = buildService();
    const application = {
      id: 'app-1',
      businessName: 'Store',
      providerType: ProviderType.SUPERMARKET,
      city: 'City',
      region: 'Region',
      ownerName: 'Owner',
      phone: '0100',
      email: 'a@b.com',
      deliveryMode: DeliveryMode.MERCHANT,
      notes: null,
      status: ProviderApplicationStatus.PENDING,
      providerId: null,
      rejectionReason: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const plan = { id: 'plan-1', code: 'BASIC', commissionRateBps: 200, billingInterval: 'MONTHLY', trialDays: 0, isActive: true };
    const provider = { id: 'prov-1', status: ProviderStatus.ACTIVE };
    const branch = { id: 'branch-1' };
    const subscription = { id: 'sub-1', status: SubscriptionStatus.ACTIVE };
    const updatedApp = { ...application, status: ProviderApplicationStatus.APPROVED, providerId: provider.id };

    prisma.providerApplication.findUnique.mockResolvedValue(application);
    prisma.plan.findUnique.mockResolvedValue(plan);
    slugs.generateUniqueSlug.mockResolvedValueOnce('provider-slug').mockResolvedValueOnce('branch-slug');
    automation.emit.mockResolvedValue({ id: 'evt-1' });

    const tx = {
      provider: { create: jest.fn().mockResolvedValue(provider), update: jest.fn().mockResolvedValue(provider) },
      branch: { updateMany: jest.fn(), create: jest.fn().mockResolvedValue(branch) },
      providerSubscription: { updateMany: jest.fn(), create: jest.fn().mockResolvedValue(subscription) },
      providerApplication: { update: jest.fn().mockResolvedValue(updatedApp) },
    } as any;
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.approveApplication('app-1', {
      planId: 'plan-1',
      commissionRateBpsOverride: 250,
      branch: { name: 'Main', city: 'City' },
    });

    expect(result.provider).toEqual(provider);
    expect(result.branch).toEqual(branch);
    expect(result.subscription).toEqual(subscription);
    expect(tx.providerSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ commissionRateBpsOverride: 250 }),
      }),
    );
    expect(automation.emit).toHaveBeenCalledWith(
      'provider.application_approved',
      expect.objectContaining({ application_id: 'app-1' }),
      expect.objectContaining({ dedupeKey: 'provider_application:app-1:approved' }),
    );
    expect(automation.emit).toHaveBeenCalledWith(
      'provider.onboarded',
      expect.objectContaining({ provider_id: 'prov-1' }),
      expect.objectContaining({ dedupeKey: 'provider:prov-1:onboarded:app-1' }),
    );
  });

  it('rejects application and emits rejection event', async () => {
    const { service, prisma, automation } = buildService();
    const application = {
      id: 'app-2',
      businessName: 'Store',
      providerType: ProviderType.SUPERMARKET,
      city: 'City',
      region: 'Region',
      ownerName: 'Owner',
      phone: '0100',
      email: 'a@b.com',
      deliveryMode: DeliveryMode.PLATFORM,
      notes: null,
      status: ProviderApplicationStatus.PENDING,
      providerId: null,
      rejectionReason: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.providerApplication.findUnique.mockResolvedValue(application);
    prisma.providerApplication.update.mockResolvedValue({
      ...application,
      status: ProviderApplicationStatus.REJECTED,
      rejectionReason: 'missing docs',
    });
    automation.emit.mockResolvedValue({ id: 'evt-2' });

    const result = await service.rejectApplication('app-2', 'missing docs');

    expect(result.status).toBe(ProviderApplicationStatus.REJECTED);
    expect(automation.emit).toHaveBeenCalledWith(
      'provider.application_rejected',
      expect.objectContaining({ application_id: 'app-2' }),
      expect.objectContaining({ dedupeKey: 'provider_application:app-2:rejected' }),
    );
  });
});
