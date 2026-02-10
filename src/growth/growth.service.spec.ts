import { GrowthService } from './growth.service';

describe('GrowthService.getFirstOrderWizard', () => {
  const buildService = () => {
    const prisma = {
      user: { findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
      order: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    } as any;
    const settings = {
      getSettings: jest.fn().mockResolvedValue({
        language: 'en',
        mobileAppConfig: {
          growthPack: {
            firstOrderWizard: {
              enabled: true,
              minHoursSinceSignup: 24,
              minAppOpens: 3,
              steps: [],
            },
          },
        },
      }),
    } as any;
    const notifications = { sendToUser: jest.fn() } as any;
    const whatsapp = { sendText: jest.fn() } as any;
    const analytics = { ingest: jest.fn() } as any;
    const service = new GrowthService(prisma, settings, notifications, whatsapp, analytics);
    return { service, prisma, notifications };
  };

  it('shows when signup threshold met and no orders', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      appOpenCount: 0,
      firstOrderWizardDismissedAt: null,
    });
    prisma.order.count.mockResolvedValue(0);

    const result = await service.getFirstOrderWizard('user-1');
    expect(result.show).toBe(true);
  });

  it('shows when app open threshold met', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      createdAt: new Date(),
      appOpenCount: 3,
      firstOrderWizardDismissedAt: null,
    });
    prisma.order.count.mockResolvedValue(0);

    const result = await service.getFirstOrderWizard('user-1');
    expect(result.show).toBe(true);
  });

  it('hides when dismissed', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      appOpenCount: 5,
      firstOrderWizardDismissedAt: new Date(),
    });
    prisma.order.count.mockResolvedValue(0);

    const result = await service.getFirstOrderWizard('user-1');
    expect(result.show).toBe(false);
  });
});

describe('GrowthService retention rate limit', () => {
  it('skips sending when retention slot is already claimed', async () => {
    const prisma = {
      user: { findMany: jest.fn(), updateMany: jest.fn() },
      order: { findMany: jest.fn(), groupBy: jest.fn() },
    } as any;
    const settings = {
      getSettings: jest.fn().mockResolvedValue({
        language: 'en',
        mobileAppConfig: { growthPack: { retention: { enabled: true, maxPerWeek: 2 } } },
      }),
    } as any;
    const notifications = { sendToUser: jest.fn() } as any;
    const whatsapp = { sendText: jest.fn() } as any;
    const analytics = { ingest: jest.fn() } as any;
    const service = new GrowthService(prisma, settings, notifications, whatsapp, analytics);

    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        phone: '01000000000',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        lastRetentionSentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        retentionCountThisWeek: 1,
        notificationPreference: { preferences: { marketing: true } },
      },
    ]);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await service.runRetentionCycle();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });
});
