import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';
import { WhatsappService } from './whatsapp.service';
import { WhatsappBroadcastDto, WhatsappBroadcastTarget } from './dto/whatsapp-broadcast.dto';

@Injectable()
export class WhatsappBroadcastService {
  private readonly logger = new Logger(WhatsappBroadcastService.name);
  private readonly batchSize = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async sendBroadcast(dto: WhatsappBroadcastDto, requestedById?: string | null) {
    const message = String(dto.message ?? '').trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }
    const sendAt = dto.sendAt ? this.ensureFutureDate(dto.sendAt) : undefined;
    const recipients = await this.resolveRecipients(dto);
    const phones = this.dedupePhones(recipients);
    if (!phones.length) {
      return { success: true, count: 0, broadcastId: null };
    }
    const broadcastId = randomUUID();
    await this.dispatchBatches(phones, async (phone) => {
      await this.whatsapp.sendText({
        to: phone,
        body: message,
        sendAt,
        metadata: {
          broadcastId,
          target: dto.target,
          requestedById: requestedById ?? null,
        },
      });
    });
    this.logger.log({
      msg: 'WhatsApp broadcast queued',
      broadcastId,
      count: phones.length,
      target: dto.target,
      sendAt: sendAt ?? null,
    });
    return { success: true, count: phones.length, broadcastId, sendAt: sendAt ?? null };
  }

  private async resolveRecipients(dto: WhatsappBroadcastDto) {
    switch (dto.target) {
      case WhatsappBroadcastTarget.ALL_CUSTOMERS:
        return this.fetchAllCustomerPhones();
      case WhatsappBroadcastTarget.LAST_CUSTOMERS:
        return this.fetchLastCustomerPhones(dto.limit);
      case WhatsappBroadcastTarget.LAST_ORDERS:
        return this.fetchLastOrderPhones(dto.limit);
      case WhatsappBroadcastTarget.RANDOM_CUSTOMERS:
        return this.fetchRandomCustomerPhones(dto.limit);
      case WhatsappBroadcastTarget.PHONES:
        return this.normalizeInputPhones(dto.phones);
      default:
        throw new BadRequestException('Unsupported target');
    }
  }

  private async fetchAllCustomerPhones() {
    const phones: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.user.findMany({
        where: { role: UserRole.CUSTOMER },
        select: { id: true, phone: true },
        orderBy: { id: 'asc' },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!batch.length) break;
      batch.forEach((item) => {
        if (item.phone) phones.push(item.phone);
      });
      cursor = batch[batch.length - 1].id;
    }
    return phones;
  }

  private async fetchLastCustomerPhones(limit?: number) {
    const take = this.ensureLimit(limit);
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.CUSTOMER },
      select: { phone: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return users.map((user) => user.phone).filter((phone): phone is string => Boolean(phone));
  }

  private async fetchLastOrderPhones(limit?: number) {
    const take = this.ensureLimit(limit);
    const orders = await this.prisma.order.findMany({
      select: { guestPhone: true, user: { select: { phone: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    const phones: string[] = [];
    for (const order of orders) {
      const phone = order.user?.phone ?? order.guestPhone ?? null;
      if (phone) phones.push(phone);
    }
    return phones;
  }

  private async fetchRandomCustomerPhones(limit?: number) {
    const take = this.ensureLimit(limit);
    const results = await this.prisma.$queryRaw<{ phone: string }[]>(
      Prisma.sql`SELECT "phone" FROM "User" WHERE "role" = ${UserRole.CUSTOMER} AND "phone" IS NOT NULL ORDER BY RANDOM() LIMIT ${take}`,
    );
    return results.map((row) => row.phone).filter((phone): phone is string => Boolean(phone));
  }

  private normalizeInputPhones(phones?: string[]) {
    if (!phones || !phones.length) {
      throw new BadRequestException('Phone list is required');
    }
    return phones.map((phone) => normalizePhoneToE164(phone));
  }

  private ensureLimit(limit?: number) {
    const value = Number(limit);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('limit is required');
    }
    return Math.min(Math.floor(value), 5000);
  }

  private ensureFutureDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('sendAt must be a valid ISO date');
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('sendAt must be in the future');
    }
    return date.toISOString();
  }

  private dedupePhones(phones: string[]) {
    const seen = new Set<string>();
    const unique: string[] = [];
    phones.forEach((phone) => {
      const trimmed = String(phone || '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      unique.push(trimmed);
    });
    return unique;
  }

  private async dispatchBatches(phones: string[], handler: (phone: string) => Promise<void>) {
    for (let i = 0; i < phones.length; i += this.batchSize) {
      const chunk = phones.slice(i, i + this.batchSize);
      await Promise.all(chunk.map((phone) => handler(phone)));
    }
  }
}
