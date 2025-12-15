import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Signup session flow (stateless)', () => {
  const configValues: Record<string, any> = {
    SIGNUP_SESSION_SECRET: 'test-signup-secret',
    TELEGRAM_BOT_USERNAME: 'TestBot',
    OTP_TTL_SECONDS: 120,
    OTP_MAX_ATTEMPTS: 3,
  };

  const config = { get: (key: string) => configValues[key] } as any;
  const rateLimiter = { ensureCanAttempt: jest.fn(), trackFailure: jest.fn(), reset: jest.fn() } as any;
  const cache = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  } as any;

  const telegram = {
    sendSignupOtp: jest.fn().mockResolvedValue({ ok: true, blocked: false }),
  } as any;

  let signupLinks: Map<string, any>;
  let prisma: any;

  beforeEach(() => {
    signupLinks = new Map();
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      signupLink: {
        findUnique: jest.fn(async ({ where: { sessionKey } }: any) => signupLinks.get(sessionKey) ?? null),
        upsert: jest.fn(async ({ where: { sessionKey }, create, update }: any) => {
          const next = signupLinks.get(sessionKey) ? { ...signupLinks.get(sessionKey), ...update } : { ...create };
          if (!next.createdAt) next.createdAt = new Date();
          signupLinks.set(sessionKey, next);
          return next;
        }),
        update: jest.fn(async ({ where: { sessionKey }, data }: any) => {
          const current = signupLinks.get(sessionKey) ?? {};
          const next = { ...current, ...data };
          signupLinks.set(sessionKey, next);
          return next;
        }),
        delete: jest.fn(async ({ where: { sessionKey } }: any) => signupLinks.delete(sessionKey)),
      },
      sessionLog: { create: jest.fn() },
    };
    telegram.sendSignupOtp.mockClear();
  });

  it('creates session token, links telegram, and requests OTP', async () => {
    const service = new AuthService(
      prisma as any,
      new JwtService(),
      rateLimiter,
      config,
      {} as any,
      cache,
      telegram,
    );

    const start = await service.signupStartSession(
      { phone: '+201234567890', country: 'EG', fullName: 'Test User' },
      {},
    );
    expect(start.success).toBe(true);
    expect(start.signupSessionToken).toBeTruthy();

    const linkToken = await service.signupCreateLinkToken(start.signupSessionToken, 'corr-1');
    expect(linkToken.success).toBe(true);
    expect(linkToken.telegramLinkToken.startsWith('lt_')).toBe(true);
    expect(linkToken.deeplink).toContain('TestBot');

    const confirm = await service.signupConfirmLinkToken(linkToken.telegramLinkToken, { chatId: BigInt(12345) });
    expect(confirm.success).toBe(true);
    expect(prisma.signupLink.upsert).toHaveBeenCalled();

    const status = await service.signupLinkStatus(start.signupSessionToken);
    expect(status.success).toBe(true);
    expect(status.linked).toBe(true);

    const otpRequest = await service.signupRequestOtp(start.signupSessionToken, { ip: '1.1.1.1' });
    expect(otpRequest.success).toBe(true);
    expect(telegram.sendSignupOtp).toHaveBeenCalled();

    const stored = Array.from(signupLinks.values())[0];
    expect(stored).toBeTruthy();
    expect(stored.otpHash).toBeTruthy();
    expect(stored.otpAttempts).toBe(0);
  });
});
