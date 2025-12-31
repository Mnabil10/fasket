import { Injectable } from '@nestjs/common';
import { BillingInterval, InvoiceItemType, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async recordCommissionForOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const order = await client.order.findUnique({
      where: { id: orderId },
      select: { id: true, providerId: true, subtotalCents: true },
    });
    if (!order?.providerId || order.subtotalCents <= 0) return null;

    const existing = await client.providerLedger.findFirst({
      where: { orderId, type: InvoiceItemType.COMMISSION },
      select: { id: true },
    });
    if (existing) return existing;

    const subscription = await client.providerSubscription.findFirst({
      where: { providerId: order.providerId, status: { in: ['TRIALING', 'ACTIVE'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const plan = subscription?.plan;
    if (!plan || plan.commissionRateBps <= 0) return null;

    const commissionCents = Math.round((order.subtotalCents * plan.commissionRateBps) / 10000);
    if (commissionCents <= 0) return null;

    const now = new Date();
    const { periodStart, periodEnd } = this.getBillingPeriod(plan.billingInterval, now);
    const invoice = await this.ensureOpenInvoice({
      providerId: order.providerId,
      subscriptionId: subscription?.id ?? null,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      plan,
      periodStart,
      periodEnd,
      now,
      client,
    });

    const ledger = await client.providerLedger.create({
      data: {
        providerId: order.providerId,
        orderId: order.id,
        invoiceId: invoice?.id ?? null,
        type: InvoiceItemType.COMMISSION,
        amountCents: commissionCents,
        currency: plan.currency ?? 'EGP',
        metadata: { rateBps: plan.commissionRateBps },
      },
    });

    if (invoice) {
      await this.addInvoiceItem({
        invoiceId: invoice.id,
        type: InvoiceItemType.COMMISSION,
        amountCents: commissionCents,
        description: `Commission for order ${order.id}`,
        client,
      });
    }
    return ledger;
  }

  async voidCommissionForOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const commission = await client.providerLedger.findFirst({
      where: { orderId, type: InvoiceItemType.COMMISSION },
      orderBy: { createdAt: 'desc' },
    });
    if (!commission) return null;

    const existingVoid = await client.providerLedger.findFirst({
      where: {
        orderId,
        type: InvoiceItemType.ADJUSTMENT,
        metadata: { path: ['reason'], equals: 'order.cancel' },
      },
    });
    if (existingVoid) return existingVoid;

    const adjustment = await client.providerLedger.create({
      data: {
        providerId: commission.providerId,
        orderId,
        invoiceId: commission.invoiceId ?? null,
        type: InvoiceItemType.ADJUSTMENT,
        amountCents: -Math.abs(commission.amountCents),
        currency: commission.currency,
        metadata: { reason: 'order.cancel' },
      },
    });

    if (commission.invoiceId) {
      await this.addInvoiceItem({
        invoiceId: commission.invoiceId,
        type: InvoiceItemType.ADJUSTMENT,
        amountCents: -Math.abs(commission.amountCents),
        description: `Commission adjustment for order ${orderId}`,
        client,
      });
    }
    return adjustment;
  }

  private async ensureOpenInvoice(params: {
    providerId: string;
    subscriptionId: string | null;
    trialEndsAt: Date | null;
    plan: { id: string; amountCents: number; currency: string; trialDays: number; billingInterval: BillingInterval };
    periodStart: Date;
    periodEnd: Date;
    now: Date;
    client: Prisma.TransactionClient;
  }) {
    const invoice = await params.client.invoice.findFirst({
      where: {
        providerId: params.providerId,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.DRAFT] },
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (invoice) return invoice;

    const number = `INV-${params.periodStart.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    const created = await params.client.invoice.create({
      data: {
        providerId: params.providerId,
        subscriptionId: params.subscriptionId ?? undefined,
        number,
        status: InvoiceStatus.OPEN,
        currency: params.plan.currency ?? 'EGP',
        amountDueCents: 0,
        amountPaidCents: 0,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        dueAt: params.periodEnd,
      },
    });

    const inTrial = params.trialEndsAt ? params.trialEndsAt > params.now : false;
    if (params.plan.amountCents > 0 && !inTrial) {
      await this.addInvoiceItem({
        invoiceId: created.id,
        type: InvoiceItemType.SUBSCRIPTION,
        amountCents: params.plan.amountCents,
        description: `Subscription fee (${params.plan.billingInterval.toLowerCase()})`,
        client: params.client,
      });
    }
    return created;
  }

  private async addInvoiceItem(params: {
    invoiceId: string;
    type: InvoiceItemType;
    amountCents: number;
    description?: string;
    client: Prisma.TransactionClient;
  }) {
    await params.client.invoiceItem.create({
      data: {
        invoiceId: params.invoiceId,
        type: params.type,
        amountCents: params.amountCents,
        description: params.description,
      },
    });
    await params.client.invoice.update({
      where: { id: params.invoiceId },
      data: { amountDueCents: { increment: params.amountCents } },
    });
  }

  private getBillingPeriod(interval: BillingInterval, now: Date) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    if (interval === BillingInterval.YEARLY) {
      const periodStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
      return { periodStart, periodEnd };
    }
    const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    return { periodStart, periodEnd };
  }
}
