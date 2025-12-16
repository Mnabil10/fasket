import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AutomationEventsService } from '../automation/automation-events.service';

class MemoryCache {
  private store = new Map<string, any>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }
  async set<T>(key: string, value: T, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

class FakePrisma {
  private sessions = new Map<string, any>();

  user = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
  };

  sessionLog = { create: jest.fn() };

  signupSession = {
    create: jest.fn(this.createSession.bind(this)),
    findUnique: jest.fn(this.findSession.bind(this)),
    findFirst: jest.fn(this.findFirstSession.bind(this)),
    updateMany: jest.fn(this.updateManySessions.bind(this)),
    update: jest.fn(this.updateSession.bind(this)),
  };

  getSession(id: string) {
    return this.sessions.get(id);
  }

  private async createSession({ data }: any) {
    const record = { ...data };
    this.sessions.set(record.id, record);
    return { ...record };
  }

  private async findSession({ where: { id } }: any) {
    const record = this.sessions.get(id);
    return record ? { ...record } : null;
  }

  private async findFirstSession({ where, orderBy }: any) {
    const matches = Array.from(this.sessions.values()).filter((session) => {
      if (where.status && session.status !== where.status) return false;
      if (where.telegramChatId === null && session.telegramChatId !== null && session.telegramChatId !== undefined) {
        return false;
      }
      if (where.expiresAt?.gt && !(session.expiresAt > where.expiresAt.gt)) return false;
      return true;
    });
    if (!matches.length) return null;
    if (orderBy?.createdAt === 'desc') {
      matches.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    }
    return { ...matches[0] };
  }

  private async updateManySessions({ where, data }: any) {
    const record = this.sessions.get(where.id);
    if (!record) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(record.status)) return { count: 0 };
    if (where.expiresAt?.gt && !(record.expiresAt > where.expiresAt.gt)) return { count: 0 };
    const next = { ...record, ...data };
    this.sessions.set(where.id, next);
    return { count: 1 };
  }

  private async updateSession({ where, data }: any) {
    const record = this.sessions.get(where.id);
    if (!record) {
      throw new Error('Session not found');
    }
    const next = { ...record, ...data };
    this.sessions.set(where.id, next);
    return { ...next };
  }
}

describe('Signup session flow (telegram)', () => {
  const configValues: Record<string, any> = {
    SIGNUP_SESSION_SECRET: 'test-signup-secret',
    SIGNUP_SESSION_TTL_SECONDS: 900,
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 3,
    OTP_SECRET: 'otp-secret',
    JWT_ACCESS_SECRET: 'jwt-access',
    JWT_REFRESH_SECRET: 'jwt-refresh',
  };
  const config = { get: (key: string) => configValues[key] } as any;
  const rateLimiter = { ensureCanAttempt: jest.fn(), trackFailure: jest.fn(), reset: jest.fn() } as any;
  const cache = new MemoryCache() as any;
  const otp = {} as any;
  const telegram = {} as any;

  let prisma: FakePrisma;
  let automationEmit: jest.Mock;
  let service: AuthService;

  beforeEach(() => {
    prisma = new FakePrisma();
    automationEmit = jest.fn().mockResolvedValue({ id: 'event-1' });
    const automation = { emit: automationEmit } as unknown as AutomationEventsService;
    service = new AuthService(
      prisma as any,
      new JwtService(),
      rateLimiter,
      config,
      otp as any,
      cache,
      telegram as any,
      automation,
    );
  });

  it('stores telegram chat id on signup session and is idempotent', async () => {
    const start = await service.signupStartSession(
      { phone: '+201234567890', country: 'EG', fullName: 'Test User' },
      {},
    );

    const first = await service.signupConfirmLinkToken(
      undefined,
      { chatId: BigInt(555), telegramUserId: BigInt(777), telegramUsername: 'tester' },
      { signupSessionId: start.signupSessionId },
    );
    expect(first.success).toBe(true);
    const stored = prisma.getSession(start.signupSessionId);
    expect(stored.telegramChatId).toBe(BigInt(555));
    expect(stored.telegramUserId).toBe(BigInt(777));
    expect(stored.telegramUsername).toBe('tester');
    expect(stored.status).toBe('TELEGRAM_LINKED');

    const second = await service.signupConfirmLinkToken(
      undefined,
      { chatId: BigInt(555) },
      { signupSessionId: start.signupSessionId },
    );
    expect(second.success).toBe(true);
    expect((prisma.signupSession.updateMany as jest.Mock).mock.calls.length).toBe(1);
  });

  it('rejects OTP requests when telegram is not linked', async () => {
    const start = await service.signupStartSession(
      { phone: '+201000000000', country: 'EG', fullName: 'Test User' },
      {},
    );

    await expect(service.signupRequestOtp({ signupSessionId: start.signupSessionId }, {})).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'TELEGRAM_NOT_LINKED', message: 'TELEGRAM_NOT_LINKED' }),
    });
  });

  it('emits automation event with telegramChatId when requesting OTP', async () => {
    const start = await service.signupStartSession(
      { phone: '+201111111111', country: 'EG', fullName: 'Test User' },
      {},
    );
    await service.signupConfirmLinkToken(undefined, { chatId: BigInt(123456789) }, { signupSessionId: start.signupSessionId });

    const otpRequest = await service.signupRequestOtp({ signupSessionId: start.signupSessionId }, {});

    expect(otpRequest.success).toBe(true);
    expect(automationEmit).toHaveBeenCalledTimes(1);
    const [eventType, payload, options] = automationEmit.mock.calls[0];
    expect(eventType).toBe('auth.otp.requested');
    expect(payload.telegramChatId).toBe(123456789);
    expect(payload.otpId).toBe(otpRequest.requestId);
    expect(options?.id).toBe(otpRequest.requestId);
  });
});
