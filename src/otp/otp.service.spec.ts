import { OtpService } from './otp.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';

class MemoryCache {
  private store = new Map<string, { value: any; expiresAt?: number }>();
  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = ttl && ttl > 0 ? Date.now() + ttl : undefined;
    this.store.set(key, { value, expiresAt });
  }
  async del(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('OtpService', () => {
  const cache = new MemoryCache();
  const prisma = {
    user: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const automation = { emit: jest.fn() } as unknown as AutomationEventsService;
  const auth = {
    issueTokensForUserId: jest.fn(),
  } as unknown as AuthService;
  const audit = { log: jest.fn() } as unknown as AuditLogService;
  const config = { get: (k: string) => process.env[k] } as any;
  const notifications = {
    sendWhatsappTemplate: jest.fn(),
  } as any;

  beforeAll(() => {
    process.env.OTP_MAX_ATTEMPTS = '2';
    process.env.OTP_TTL_SECONDS = '120';
    process.env.OTP_SECRET = 'very-strong-secret-value';
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-1' } as any);
  });

  beforeEach(() => {
    cache.clear();
    notifications.sendWhatsappTemplate = jest.fn();
  });

  it('locks after max failed attempts', async () => {
    const service = new OtpService(
      cache as any,
      prisma,
      automation,
      config,
      auth,
      audit,
      notifications,
    );
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');

    const req = await service.requestOtp('+201234567890', 'LOGIN');
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    const locked = await cache.get<boolean>('otp:lock:LOGIN:+201234567890');
    expect(locked).toBeTruthy();
  });

  it('accepts valid OTPs for login', async () => {
    const service = new OtpService(
      cache as any,
      prisma,
      automation,
      config,
      auth,
      audit,
      notifications,
    );
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');
    auth.issueTokensForUserId = jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });

    const req = await service.requestOtp('+201234567891', 'LOGIN');
    const result = await service.verifyOtp('+201234567891', 'LOGIN', req.otpId, '123456');

    expect(result).toEqual({ success: true, tokens: { accessToken: 'access', refreshToken: 'refresh' } });
  });

  it('returns invalid OTP while the record is active', async () => {
    const service = new OtpService(
      cache as any,
      prisma,
      automation,
      config,
      auth,
      audit,
      notifications,
    );
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');

    const req = await service.requestOtp('+201234567892', 'LOGIN');
    await expect(service.verifyOtp('+201234567892', 'LOGIN', req.otpId, '000000')).rejects.toThrow('Invalid OTP');
  });

  it('returns expired OTP after TTL elapses', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    process.env.OTP_TTL_SECONDS_TEST = '1';

    const service = new OtpService(
      cache as any,
      prisma,
      automation,
      config,
      auth,
      audit,
      notifications,
    );
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');

    const req = await service.requestOtp('+201234567893', 'LOGIN');
    jest.setSystemTime(new Date(Date.now() + 2000));

    await expect(service.verifyOtp('+201234567893', 'LOGIN', req.otpId, '123456')).rejects.toThrow(
      'Invalid or expired OTP',
    );

    delete process.env.OTP_TTL_SECONDS_TEST;
    jest.useRealTimers();
  });
});
