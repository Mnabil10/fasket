import { Injectable, Logger } from '@nestjs/common';
import { BranchStatus, OrderStatus, Prisma, ProductStatus, ProviderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { toPublicImageUrl } from '../uploads/image.util';
import { localize } from '../common/utils/localize.util';

const DEFAULT_WIZARD = {
  enabled: true,
  minHoursSinceSignup: 24,
  minAppOpens: 3,
  steps: [
    {
      id: 'delivery-mode',
      title: { en: 'How do you want your delivery?', ar: 'How do you want your delivery?' },
      subtitle: { en: 'Pick a mode to start shopping fast.', ar: 'Pick a mode to start shopping fast.' },
      options: [
        {
          id: 'instant',
          label: { en: 'Fast delivery today', ar: 'Fast delivery today' },
          action: { type: 'OPEN_VENDOR', mode: 'INSTANT' },
        },
        {
          id: 'preorder',
          label: { en: 'Schedule for tomorrow', ar: 'Schedule for tomorrow' },
          action: { type: 'OPEN_VENDOR', mode: 'PREORDER' },
        },
      ],
    },
  ],
};

const DEFAULT_RETENTION = {
  enabled: true,
  maxPerWeek: 2,
  segments: {
    SignedUp_NoOrder: {
      afterHours: 24,
      title: { en: 'Ready for your first order?', ar: 'Ready for your first order?' },
      body: { en: 'Shop essentials now and get fast delivery.', ar: 'Shop essentials now and get fast delivery.' },
      channels: ['push', 'whatsapp'],
    },
    OrderedOnce: {
      afterDays: 3,
      title: { en: 'Reorder in one tap', ar: 'Reorder in one tap' },
      body: { en: 'Your last order is ready to repeat.', ar: 'Your last order is ready to repeat.' },
      channels: ['push'],
    },
    RepeatCustomer: {
      afterDays: 7,
      title: { en: 'Your weekly essentials are waiting', ar: 'Your weekly essentials are waiting' },
      body: { en: 'Come back for your usual favorites.', ar: 'Come back for your usual favorites.' },
      channels: ['push'],
    },
  },
};

@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly whatsapp: WhatsappService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getLastOrders(userId: string, limit = 2) {
    const take = Math.min(Math.max(Number(limit) || 2, 1), 10);
    const orders = await this.prisma.order.findMany({
      where: { userId, status: OrderStatus.DELIVERED },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        provider: { select: { id: true, name: true, nameAr: true } },
        items: { select: { qty: true } },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      code: order.code,
      createdAt: order.createdAt,
      totalCents: order.totalCents,
      status: order.status,
      providerId: order.providerId ?? null,
      providerName: order.provider ? order.provider.name : null,
      providerNameAr: order.provider?.nameAr ?? null,
      itemsCount: order.items.reduce((sum, item) => sum + (item.qty ?? 0), 0),
    }));
  }

  async getFrequentlyBought(userId: string, limit = 8, lang: 'en' | 'ar' = 'en') {
    const take = Math.min(Math.max(Number(limit) || 8, 1), 20);
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const agg = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { qty: true },
      where: {
        order: {
          userId,
          status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED] },
          createdAt: { gte: since },
        },
      },
      orderBy: { _sum: { qty: 'desc' } },
      take,
    });
    if (!agg.length) return [];
    const ids = agg.map((row) => row.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, status: ProductStatus.ACTIVE, deletedAt: null },
      include: { category: { select: { id: true, name: true, nameAr: true, slug: true } } },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const ordered = agg
      .map((row) => productMap.get(row.productId))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
    return Promise.all(ordered.map((product) => this.toProductSummary(product, lang)));
  }

  async getFirstOrderWizard(userId: string) {
    const settings = await this.settings.getSettings();
    const growthPack = this.extractGrowthPack(settings.mobileAppConfig);
    const config = this.mergeConfig(DEFAULT_WIZARD, growthPack?.firstOrderWizard ?? {});

    if (!config.enabled) {
      return { show: false, once: true, steps: config.steps ?? [] };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, appOpenCount: true, firstOrderWizardDismissedAt: true },
    });
    if (!user) {
      return { show: false, once: true, steps: config.steps ?? [] };
    }

    const ordersCount = await this.prisma.order.count({ where: { userId } });
    const hoursSinceSignup = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60);
    const openCount = user.appOpenCount ?? 0;
    const show =
      ordersCount === 0 &&
      !user.firstOrderWizardDismissedAt &&
      (hoursSinceSignup >= (config.minHoursSinceSignup ?? 24) || openCount >= (config.minAppOpens ?? 3));

    if (!show) {
      return { show: false, once: true, steps: config.steps ?? [] };
    }

    const enrichedSteps = await this.attachRecommendedVendors(config.steps ?? []);
    return {
      show: true,
      once: true,
      steps: enrichedSteps,
      incentive: config.incentive ?? undefined,
    };
  }

  async dismissFirstOrderWizard(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { firstOrderWizardDismissedAt: new Date() },
    });
    return { success: true };
  }

  async runRetentionCycle() {
    const settings = await this.settings.getSettings();
    const growthPack = this.extractGrowthPack(settings.mobileAppConfig);
    const config = this.mergeConfig(DEFAULT_RETENTION, growthPack?.retention ?? {});
    if (!config.enabled) return { success: true, skipped: true };

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const activeOrderUsers = await this.prisma.order.findMany({
      where: {
        userId: { not: null },
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY] },
      },
      distinct: ['userId'],
      select: { userId: true },
    });
    const activeSet = new Set(activeOrderUsers.map((row) => row.userId).filter(Boolean) as string[]);

    const deliveredAgg = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, status: OrderStatus.DELIVERED },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const orderedOnceIds = deliveredAgg
      .filter((row) => (row._count?._all ?? 0) === 1 && row._max?.createdAt && row._max.createdAt <= threeDaysAgo)
      .map((row) => row.userId)
      .filter(Boolean) as string[];
    const repeatIds = deliveredAgg
      .filter((row) => (row._count?._all ?? 0) >= 2 && row._max?.createdAt && row._max.createdAt <= sevenDaysAgo)
      .map((row) => row.userId)
      .filter(Boolean) as string[];

    const signedUpNoOrderUsers = await this.prisma.user.findMany({
      where: {
        role: UserRole.CUSTOMER,
        createdAt: { lte: dayAgo },
        orders: { none: {} },
      },
      select: this.userRetentionSelect(),
    });

    const orderedOnceUsers = orderedOnceIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: orderedOnceIds }, role: UserRole.CUSTOMER },
          select: this.userRetentionSelect(),
        })
      : [];

    const repeatUsers = repeatIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: repeatIds }, role: UserRole.CUSTOMER },
          select: this.userRetentionSelect(),
        })
      : [];

    const tasks = [
      { segment: 'SignedUp_NoOrder', users: signedUpNoOrderUsers },
      { segment: 'OrderedOnce', users: orderedOnceUsers },
      { segment: 'RepeatCustomer', users: repeatUsers },
    ];

    for (const task of tasks) {
      for (const user of task.users) {
        if (!user?.id) continue;
        if (activeSet.has(user.id)) continue;
        if (!this.isMarketingAllowed(user.notificationPreference?.preferences)) continue;
        if (!this.withinRetentionLimit(user, config.maxPerWeek ?? 2, now)) continue;

        const claimed = await this.claimRetentionSlot(user, config.maxPerWeek ?? 2, now);
        if (!claimed) continue;

        const message = this.resolveRetentionMessage(task.segment, config, settings.language ?? 'en');
        if (!message) continue;

        let sentAny = false;
        try {
          await this.trackRetentionEvent(user.id, 'RETENTION_MESSAGE_ATTEMPT', { segment: task.segment, channel: 'push' });
          await this.notifications.sendToUser(
            {
              title: message.title,
              body: message.body,
              type: 'retention',
              data: { segment: task.segment },
            },
            user.id,
          );
          sentAny = true;
        } catch (error) {
          this.logger.warn({ msg: 'Retention push failed', userId: user.id, segment: task.segment, error: (error as Error).message });
        }

        if (message.channels.includes('whatsapp') && user.phone) {
          try {
            await this.trackRetentionEvent(user.id, 'RETENTION_MESSAGE_ATTEMPT', { segment: task.segment, channel: 'whatsapp' });
            await this.whatsapp.sendText({
              to: user.phone,
              body: message.body,
              metadata: { segment: task.segment, userId: user.id },
            });
            sentAny = true;
          } catch (error) {
            this.logger.warn({
              msg: 'Retention WhatsApp failed',
              userId: user.id,
              segment: task.segment,
              error: (error as Error).message,
            });
          }
        }

        if (sentAny) {
          await this.trackRetentionEvent(user.id, 'RETENTION_MESSAGE_SENT', { segment: task.segment });
        }
      }
    }

    return { success: true };
  }

  private userRetentionSelect() {
    return {
      id: true,
      phone: true,
      createdAt: true,
      lastRetentionSentAt: true,
      retentionCountThisWeek: true,
      notificationPreference: { select: { preferences: true } },
    } as const;
  }

  private withinRetentionLimit(user: { lastRetentionSentAt: Date | null; retentionCountThisWeek: number | null }, maxPerWeek: number, now: Date) {
    const lastSent = user.lastRetentionSentAt;
    const lastCount = user.retentionCountThisWeek ?? 0;
    if (!lastSent) return true;
    const diff = now.getTime() - lastSent.getTime();
    if (diff > 7 * 24 * 60 * 60 * 1000) return true;
    return lastCount < maxPerWeek;
  }

  private async claimRetentionSlot(
    user: { id: string; lastRetentionSentAt: Date | null; retentionCountThisWeek: number | null },
    maxPerWeek: number,
    now: Date,
  ) {
    const lastSent = user.lastRetentionSentAt;
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const reset = !lastSent || lastSent < weekAgo;
    const nextCount = reset ? 1 : (user.retentionCountThisWeek ?? 0) + 1;
    const where = reset
      ? { id: user.id, OR: [{ lastRetentionSentAt: null }, { lastRetentionSentAt: { lt: weekAgo } }] }
      : { id: user.id, lastRetentionSentAt: { gte: weekAgo }, retentionCountThisWeek: { lt: maxPerWeek } };
    const updated = await this.prisma.user.updateMany({
      where,
      data: { lastRetentionSentAt: now, retentionCountThisWeek: nextCount },
    });
    return updated.count > 0;
  }

  private resolveRetentionMessage(segment: string, config: any, lang: string) {
    const def = config?.segments?.[segment];
    if (!def) return null;
    const title = this.resolveLocalized(def.title, lang);
    const body = this.resolveLocalized(def.body, lang);
    const channels = Array.isArray(def.channels) ? def.channels : ['push'];
    return { title, body, channels };
  }

  private resolveLocalized(value: any, lang: string) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const candidate = lang?.startsWith('ar') ? value.ar : value.en;
      return candidate || value.en || value.ar || '';
    }
    return String(value);
  }

  private isMarketingAllowed(preferences?: Prisma.JsonValue | null) {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
    const prefs = preferences as Record<string, any>;
    return Boolean(prefs.marketing === true);
  }

  private async trackRetentionEvent(userId: string, name: string, params?: Record<string, any>) {
    await this.analytics.ingest(userId, {
      events: [{ name, ts: new Date(), params }],
      source: 'backend',
    });
  }

  private extractGrowthPack(payload?: Prisma.JsonValue | null) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const config = payload as Record<string, any>;
    return config.growthPack ?? null;
  }

  private mergeConfig(base: any, override: any) {
    if (!override || typeof override !== 'object') return { ...base };
    const merged = { ...base, ...override };
    Object.keys(base).forEach((key) => {
      const baseValue = base[key];
      const overrideValue = override[key];
      if (baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
        merged[key] = this.mergeConfig(baseValue, overrideValue ?? {});
      }
    });
    return merged;
  }

  private async attachRecommendedVendors(steps: any[]) {
    if (!Array.isArray(steps)) return [];
    const enriched = [] as any[];
    for (const step of steps) {
      if (!step || typeof step !== 'object') {
        enriched.push(step);
        continue;
      }
      const options = Array.isArray(step.options) ? step.options : [];
      const nextOptions = [] as any[];
      for (const option of options) {
        const action = option?.action ?? {};
        if (action?.type === 'OPEN_VENDOR' && !action.vendorId) {
          const vendorId = await this.findRecommendedVendor(action.mode);
          nextOptions.push({ ...option, action: { ...action, vendorId: vendorId ?? undefined } });
        } else {
          nextOptions.push(option);
        }
      }
      enriched.push({ ...step, options: nextOptions });
    }
    return enriched;
  }

  private async findRecommendedVendor(mode?: string) {
    const branchWhere: Prisma.BranchWhereInput = {
      status: BranchStatus.ACTIVE,
      provider: { status: ProviderStatus.ACTIVE },
    };
    if (mode === 'PREORDER') {
      branchWhere.schedulingEnabled = true;
    } else if (mode === 'INSTANT') {
      branchWhere.OR = [{ schedulingEnabled: false }, { schedulingAllowAsap: true }];
    }
    const branches = await this.prisma.branch.findMany({
      where: branchWhere,
      select: { providerId: true },
    });
    const providerIds = Array.from(new Set(branches.map((branch) => branch.providerId)));
    if (!providerIds.length) return null;

    if (mode === 'PREORDER') {
      const windows = await this.prisma.deliveryWindow.findMany({
        where: { providerId: { in: providerIds }, isActive: true },
        distinct: ['providerId'],
        select: { providerId: true },
      });
      const allowed = new Set(windows.map((window) => window.providerId));
      const filtered = providerIds.filter((id) => allowed.has(id));
      if (!filtered.length) return null;
      providerIds.length = 0;
      providerIds.push(...filtered);
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: { in: providerIds }, status: ProviderStatus.ACTIVE },
      orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return provider?.id ?? null;
  }

  private async toProductSummary(product: any, lang: 'en' | 'ar') {
    const isWeightBased = product.pricingModel === 'weight';
    return {
      id: product.id,
      name: localize(product.name, product.nameAr ?? undefined, lang) ?? product.name,
      slug: product.slug,
      imageUrl: await toPublicImageUrl(product.imageUrl),
      etag: this.buildEtag(product),
      priceCents: product.priceCents,
      salePriceCents: product.salePriceCents,
      pricingModel: product.pricingModel,
      pricePerKg: product.pricePerKg,
      unitLabel: product.unitLabel ?? (isWeightBased ? 'kg' : null),
      isWeightBased,
      weightBased: isWeightBased,
      stock: product.stock,
      providerId: product.providerId,
      category: product.category
        ? {
            id: product.category.id,
            name: localize(product.category.name, product.category.nameAr ?? undefined, lang) ?? product.category.name,
            slug: product.category.slug,
          }
        : null,
    };
  }

  private buildEtag(product: { id: string; updatedAt?: Date }) {
    const updated = product.updatedAt ? product.updatedAt.getTime() : Date.now();
    return `${product.id}-${updated}`;
  }
}
