import { OtpService } from './otp.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';

class MemoryCache {
  private store = new Map<string, any>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }
  async set<T>(key: string, value: T): Promise<void>;
  async set<T>(key: string, value: T, _ttl: number): Promise<void>;
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

describe('OtpService', () => {
  const cache = new MemoryCache() as any;
  const prisma = {
    user: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const automation = { emit: jest.fn() } as unknown as AutomationEventsService;
  const auth = {
    issueTokensForUserId: jest.fn(),
  } as unknown as AuthService;
  const audit = { log: jest.fn() } as unknown as AuditLogService;
  const config = { get: (k: string) => process.env[k] } as any;

  beforeAll(() => {
    process.env.OTP_MAX_ATTEMPTS = '2';
    process.env.OTP_TTL_SECONDS = '120';
  });

  it('locks after max failed attempts', async () => {
    const service = new OtpService(cache, prisma, automation, config, auth, audit);
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');

    const req = await service.requestOtp('+201234567890', 'LOGIN');
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    const locked = await cache.get<boolean>('otp:lock:LOGIN:+201234567890');
    expect(locked).toBeTruthy();
  });
});
