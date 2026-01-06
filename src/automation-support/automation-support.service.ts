import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { createHash } from 'crypto';

@Injectable()
export class AutomationSupportService {
  private readonly phoneRegex = /^\+?[1-9]\d{7,14}$/;
  private readonly rateLimitTtl = 600;
  private readonly rateLimitPerPhone = 5;
  private readonly rateLimitPerIp = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly automation: AutomationEventsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async orderStatusLookup(params: { phone: string; orderCode?: string; last4?: string; ip?: string; correlationId?: string }) {
    const phone = this.normalizePhone(params.phone);
    await this.bumpOrThrow(`support:status:phone:${phone}`, this.rateLimitPerPhone, this.rateLimitTtl, 'Rate limit exceeded');
    if (params.ip) {
      await this.bumpOrThrow(`support:status:ip:${params.ip}`, this.rateLimitPerIp, this.rateLimitTtl, 'Rate limit exceeded');
    }

    let success = false;
    try {
      const user = await this.prisma.user.findUnique({
        where: { phone },
        select: { id: true, phone: true, name: true },
      });
      if (!user) {
        await this.auditSupport('order-status', phone, false, params.correlationId, params.ip);
        success = true;
        return { orders: [] };
      }

      let orders: any[] = [];
      if (params.orderCode) {
        const order = await this.prisma.order.findFirst({
          where: { code: params.orderCode, userId: user.id },
          include: {
            items: { select: { productNameSnapshot: true, qty: true } },
            driver: { select: { fullName: true, phone: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        orders = order ? [order] : [];
      } else {
        const list = await this.prisma.order.findMany({
          where: { userId: user.id },
          include: {
            items: { select: { productNameSnapshot: true, qty: true } },
            driver: { select: { fullName: true, phone: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        if (params.last4) {
          orders = list.filter((o) => (o.code || o.id).endsWith(params.last4 as string)).slice(0, 2);
        } else {
          orders = list.slice(0, 2);
        }
      }

      const mapped = orders.map((order) => ({
        orderCode: order.code ?? order.id,
        status: this.toPublicStatus(order.status),
        etaMinutes: order.deliveryEtaMinutes ?? null,
        itemsSummary: (order.items || []).map((i: any) => `${i.productNameSnapshot} x${i.qty}`).join(', '),
        totalFormatted: (order.totalCents / 100).toFixed(2),
        createdAt: order.createdAt,
        driver: order.driver
          ? {
              name: order.driver.fullName,
              phoneMasked: this.maskPhone(order.driver.phone),
            }
          : null,
      }));

      success = true;
      await this.auditSupport('order-status', phone, true, params.correlationId, params.ip, orders[0]?.code ?? orders[0]?.id, mapped.map((m) => `${m.orderCode}:${m.status}`).join('; ').slice(0, 240));
      await this.automation.emit(
        'support.order_status.requested',
        { phone, orderCode: params.orderCode ?? null, results: mapped.length },
        { dedupeKey: `support:status:${phone}:${params.orderCode ?? 'latest'}` },
      );
      return { orders: mapped };
    } finally {
      if (!success) {
        await this.auditSupport('order-status', this.normalizePhoneSafe(params.phone), false, params.correlationId, params.ip, params.orderCode);
      }
    }
  }

  async productSearch(q: string, ip?: string) {
    const query = (q || '').trim();
    if (!query) throw new BadRequestException('q is required');
    await this.bumpOrThrow(`support:product:ip:${ip ?? 'unknown'}`, 30, this.rateLimitTtl, 'Rate limit exceeded');

    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nameAr: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { id: true, sku: true, name: true, nameAr: true, priceCents: true, salePriceCents: true, stock: true },
    });
    return {
      items: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.nameAr || p.name,
        priceCents: p.salePriceCents ?? p.priceCents,
        available: (p.stock ?? 0) > 0,
      })),
    };
  }

  async deliveryZones() {
    const zones = await this.settings.getActiveDeliveryZones();
    return zones.map((z) => ({ id: z.id, name: z.nameEn ?? z.nameAr ?? z.id }));
  }

  private normalizePhone(phone: string) {
    const trimmed = (phone || '').trim();
    if (!this.phoneRegex.test(trimmed)) {
      throw new BadRequestException('Invalid phone');
    }
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private normalizePhoneSafe(phone?: string) {
    if (!phone) return '';
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  private maskPhone(phone: string) {
    if (!phone) return '';
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }

  private toPublicStatus(status: string) {
    switch (status) {
      case 'CONFIRMED':
        return 'CONFIRMED';
      case 'PREPARING':
        return 'PREPARING';
      case 'OUT_FOR_DELIVERY':
        return 'OUT_FOR_DELIVERY';
      case 'DELIVERED':
        return 'DELIVERED';
      case 'CANCELED':
        return 'CANCELED';
      default:
        return 'PENDING';
    }
  }

  private async auditSupport(
    endpoint: string,
    phone: string,
    success: boolean,
    correlationId?: string,
    ip?: string,
    orderCode?: string,
    responseSnippet?: string,
  ) {
    const phoneHash = phone ? createHash('sha256').update(phone).digest('hex') : undefined;
    await this.prisma.supportQueryAudit.create({
      data: {
        endpoint,
        phoneHash,
        phoneMasked: this.maskPhone(phone),
        success,
        correlationId,
        ip,
        orderCode: orderCode ?? null,
        responseSnippet: responseSnippet ?? null,
      },
    });
  }

  private async bumpOrThrow(key: string, limit: number, ttl: number, message: string) {
    const current = (await this.cache.get<number>(key)) ?? 0;
    if (current >= limit) {
      throw new BadRequestException(message);
    }
    await this.cache.set(key, current + 1, ttl);
  }
}
