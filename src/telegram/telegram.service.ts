import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import axios from 'axios';
import { TelegramLink, TelegramLinkStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';

interface TelegramLinkParams {
  userId: string;
  phoneE164: string;
  telegramChatId: bigint;
  telegramUserId?: bigint;
  telegramUsername?: string;
}

interface TelegramOtpPayload {
  link: TelegramLink;
  otp: string;
  expiresInSeconds: number;
  userId: string;
  purpose: string;
  requestId: string;
  phone?: string;
}

interface TelegramOtpResult {
  ok: boolean;
  blocked: boolean;
  status?: number;
  error?: string;
}

interface LinkTokenData {
  userId: string;
  phoneE164: string;
  expiresAt: number;
  usedAt?: number;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botUsername: string;
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;
  private readonly linkTokenTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME') || 'FasketSuberBot';
    this.webhookUrl =
      this.config.get<string>('N8N_SEND_TELEGRAM_OTP_URL') ||
      this.config.get<string>('TELEGRAM_OTP_WEBHOOK_URL') ||
      'https://automation.fasket.cloud/webhook/send-telegram-otp';
    this.webhookSecret =
      this.config.get<string>('N8N_SECRET') || this.config.get<string>('TELEGRAM_OTP_WEBHOOK_SECRET') || '';
    this.linkTokenTtlMinutes = Number(this.config.get('TELEGRAM_LINK_TOKEN_TTL_MIN') ?? 10);
  }

  async createLinkToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true } });
    if (!user?.phone) {
      throw new BadRequestException('User phone not found');
    }
    const phoneE164 = normalizePhoneToE164(user.phone);
    const token = cryptoRandom();
    const expiresAt = Date.now() + this.linkTokenTtlMinutes * 60 * 1000;
    const data: LinkTokenData = { userId, phoneE164, expiresAt, usedAt: undefined };
    await this.cache.set(this.linkTokenKey(token), data, this.linkTokenTtlMinutes * 60);
    return {
      token,
      phoneE164,
      deeplink: this.buildDeeplink(token),
      expiresInMinutes: this.linkTokenTtlMinutes,
    };
  }

  async consumeLinkToken(token: string): Promise<LinkTokenData> {
    const stored = await this.cache.get<LinkTokenData>(this.linkTokenKey(token));
    if (!stored) {
      throw new BadRequestException('TOKEN_INVALID');
    }
    if (stored.usedAt) {
      throw new BadRequestException('TOKEN_USED');
    }
    if (stored.expiresAt < Date.now()) {
      throw new BadRequestException('TOKEN_EXPIRED');
    }
    stored.usedAt = Date.now();
    await this.cache.set(this.linkTokenKey(token), stored, Math.max(30, Math.ceil((stored.expiresAt - Date.now()) / 1000)));
    return stored;
  }

  async link(params: TelegramLinkParams) {
    const user = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const phoneE164 = normalizePhoneToE164(params.phoneE164);
    const existingChat = await this.prisma.telegramLink.findFirst({
      where: { telegramChatId: params.telegramChatId },
      select: { userId: true },
    });
    if (existingChat && existingChat.userId !== params.userId) {
      throw new BadRequestException('Telegram chat already linked to another user');
    }

    const now = new Date();
    const link = await this.prisma.telegramLink.upsert({
      where: { userId: params.userId },
      update: {
        phoneE164,
        telegramChatId: params.telegramChatId,
        telegramUserId: params.telegramUserId ?? null,
        telegramUsername: params.telegramUsername ?? null,
        status: TelegramLinkStatus.linked,
        linkedAt: now,
        lastOtpAttempts: 0,
        lastOtpSentAt: null,
      },
      create: {
        userId: params.userId,
        phoneE164,
        telegramChatId: params.telegramChatId,
        telegramUserId: params.telegramUserId ?? null,
        telegramUsername: params.telegramUsername ?? null,
        status: TelegramLinkStatus.linked,
        linkedAt: now,
        lastOtpAttempts: 0,
      },
    });

    await this.audit.log({
      action: 'telegram.linked',
      entity: 'telegram_link',
      entityId: String(link.id),
      before: null,
      after: {
        userId: params.userId,
        phoneE164,
        telegramChatId: params.telegramChatId.toString(),
        telegramUserId: params.telegramUserId?.toString() ?? null,
        telegramUsername: params.telegramUsername ?? null,
      },
    });

    return link;
  }

  async unlink(userId: string) {
    const existing = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!existing) {
      return;
    }
    if (existing.status === TelegramLinkStatus.unlinked) {
      return;
    }
    await this.prisma.telegramLink.update({
      where: { userId },
      data: { status: TelegramLinkStatus.unlinked },
    });
    await this.audit.log({
      action: 'telegram.unlinked',
      entity: 'telegram_link',
      entityId: String(existing.id),
      before: { status: existing.status },
      after: { status: TelegramLinkStatus.unlinked },
    });
  }

  buildDeeplink(token: string) {
    return `https://t.me/${this.botUsername}?start=${encodeURIComponent(token)}`;
  }

  async getActiveLinkForUser(userId: string) {
    return this.prisma.telegramLink.findFirst({
      where: { userId, status: TelegramLinkStatus.linked },
    });
  }

  async getActiveLinkByPhone(phoneE164: string) {
    const normalized = normalizePhoneToE164(phoneE164);
    return this.prisma.telegramLink.findFirst({
      where: { phoneE164: normalized, status: TelegramLinkStatus.linked },
    });
  }

  async getLinkByChatId(chatId: bigint) {
    return this.prisma.telegramLink.findFirst({
      where: { telegramChatId: chatId },
    });
  }

  async markBlocked(linkId: number, reason?: string) {
    const updated = await this.prisma.telegramLink.update({
      where: { id: linkId },
      data: { status: TelegramLinkStatus.blocked },
    });
    await this.audit.log({
      action: 'telegram.blocked',
      entity: 'telegram_link',
      entityId: String(linkId),
      before: null,
      after: { status: updated.status, reason },
    });
  }

  async sendOtp(params: TelegramOtpPayload): Promise<TelegramOtpResult> {
    if (!this.webhookUrl || !this.webhookSecret) {
      this.logger.error('Telegram OTP webhook misconfigured');
      return { ok: false, blocked: false, error: 'webhook_misconfigured' };
    }
    const expiresMinutes = Math.max(1, Math.ceil(params.expiresInSeconds / 60));
    const chatId = this.normalizeNumeric(params.link.telegramChatId);
    const body = {
      telegramChatId: chatId,
      otp: params.otp,
      expires: expiresMinutes,
      requestId: params.requestId,
    };
    try {
      const response = await axios.post(this.webhookUrl, body, {
        headers: {
          'content-type': 'application/json',
          'x-n8n-secret': this.webhookSecret,
        },
        timeout: 5000,
        validateStatus: () => true,
      });
      const blocked = this.shouldBlock(response.data);
      const success = response.status >= 200 && response.status < 300 && response.data?.success !== false;
      if (success) {
        await this.bumpOtpCounters(params.link);
        await this.audit.log({
          action: 'telegram.otp.sent',
          entity: 'telegram_link',
          entityId: String(params.link.id),
          before: null,
          after: {
            userId: params.userId,
            chatId: typeof chatId === 'string' ? chatId : String(chatId),
            status: response.status,
            requestId: params.requestId,
            purpose: params.purpose,
          },
        });
        return { ok: true, blocked: false, status: response.status };
      }
      if (blocked) {
        await this.markBlocked(params.link.id, 'telegram_blocked');
      }
      return {
        ok: false,
        blocked,
        status: response.status,
        error: response.data?.error ?? `telegram_webhook_${response.status}`,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn({ msg: 'Telegram OTP send failed', error: message });
      return { ok: false, blocked: false, error: message };
    }
  }

  private async bumpOtpCounters(link: TelegramLink) {
    const now = new Date();
    const lastSentAt = link.lastOtpSentAt ? new Date(link.lastOtpSentAt) : null;
    const diff = lastSentAt ? now.getTime() - lastSentAt.getTime() : null;
    const reset = diff === null || diff > 24 * 60 * 60 * 1000;
    const attempts = reset ? 1 : (link.lastOtpAttempts ?? 0) + 1;
    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: { lastOtpSentAt: now, lastOtpAttempts: attempts },
    });
  }

  private normalizeNumeric(value: bigint) {
    const asNumber = Number(value);
    if (Number.isSafeInteger(asNumber)) return asNumber;
    return value.toString();
  }

  private shouldBlock(data: any) {
    try {
      const target = typeof data === 'string' ? data : JSON.stringify(data);
      const normalized = target.toLowerCase();
      return (
        normalized.includes('chat not found') ||
        normalized.includes('blocked') ||
        normalized.includes('forbidden') ||
        normalized.includes('user is deactivated') ||
        normalized.includes('bot was blocked')
      );
    } catch {
      return false;
    }
  }

  private linkTokenKey(token: string) {
    return `telegram:linktoken:${token}`;
  }
}

function cryptoRandom() {
  return randomUUID().replace(/-/g, '');
}
