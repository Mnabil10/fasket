import axios from 'axios';
import { OtpService } from './otp.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { TelegramService } from '../telegram/telegram.service';
import { RequestContextService } from '../common/context/request-context.service';

jest.mock('axios');

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
  const telegram = {
    getActiveLinkForUser: jest.fn(),
    sendOtp: jest.fn(),
  } as unknown as TelegramService;
  const context = { get: jest.fn() } as unknown as RequestContextService;

  beforeAll(() => {
    process.env.OTP_MAX_ATTEMPTS = '2';
    process.env.OTP_TTL_SECONDS = '120';
    process.env.OTP_SECRET = 'very-strong-secret-value';
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-1' } as any);
    telegram.getActiveLinkForUser = jest.fn().mockResolvedValue({
      id: 1,
      telegramChatId: BigInt(123),
      lastOtpAttempts: 0,
      lastOtpSentAt: null,
    } as any);
    telegram.sendOtp = jest.fn().mockResolvedValue({ ok: true, blocked: false });
    context.get = jest.fn().mockReturnValue(undefined);
  });

  beforeEach(() => {
    (axios.post as jest.Mock).mockReset();
  });

  it('locks after max failed attempts', async () => {
    const service = new OtpService(cache, prisma, automation, config, auth, audit, telegram, context);
    (service as any).generateOtp = jest.fn().mockReturnValue('123456');

    const req = await service.requestOtp('+201234567890', 'LOGIN');
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    await expect(service.verifyOtp('+201234567890', 'LOGIN', req.otpId, '000000')).rejects.toBeTruthy();
    const locked = await cache.get<boolean>('otp:lock:LOGIN:+201234567890');
    expect(locked).toBeTruthy();
  });

  it('sends x-fasket-secret header when fallback webhook is used', async () => {
    process.env.AUTOMATION_WEBHOOK_URL = 'https://automation.test/webhook';
    process.env.AUTOMATION_HMAC_SECRET = 'hmac-secret';
    process.env.AUTOMATION_WEBHOOK_SECRET = 'static-secret';
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-1' } as any);
    telegram.getActiveLinkForUser = jest.fn().mockResolvedValue(null);
    telegram.sendOtp = jest.fn().mockResolvedValue({ ok: false, blocked: false });
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    const service = new OtpService(cache, prisma, automation, config, auth, audit, telegram, context);
    (service as any).generateOtp = jest.fn().mockReturnValue('654321');

    const result = await service.requestOtp('+201555555555', 'LOGIN');
    expect(result.channel).toBe('fallback');
    expect(axios.post).toHaveBeenCalledTimes(1);
    const headers = (axios.post as jest.Mock).mock.calls[0][2].headers;
    expect(headers['x-fasket-secret']).toBe('static-secret');
  });
});
