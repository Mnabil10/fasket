import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { CreateSubscriptionDto, SubscriptionListRequestDto, UpdateSubscriptionDto } from './dto/subscription.dto';

@ApiTags('Admin/Subscriptions')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/subscriptions', version: ['1'] })
export class AdminSubscriptionsController {
  constructor(private svc: AdminService) {}

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  @Get()
  @ApiQuery({ name: 'providerId', required: false })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Paginated subscriptions' })
  async list(@Query() query: SubscriptionListRequestDto) {
    const where: Prisma.ProviderSubscriptionWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.planId) where.planId = query.planId;
    if (query.status) where.status = query.status as any;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.providerSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          provider: { select: { id: true, name: true, slug: true, status: true } },
          plan: { select: { id: true, code: true, name: true, billingInterval: true, amountCents: true, commissionRateBps: true } },
        },
      }),
      this.svc.prisma.providerSubscription.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.svc.prisma.providerSubscription.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, slug: true, status: true } },
        plan: { select: { id: true, code: true, name: true, billingInterval: true, amountCents: true, commissionRateBps: true } },
      },
    });
  }

  @Post()
  async create(@Body() dto: CreateSubscriptionDto) {
    const provider = await this.svc.prisma.provider.findUnique({ where: { id: dto.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    const plan = await this.svc.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const now = new Date();
    const status =
      dto.status ??
      (plan.trialDays && plan.trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE);
    const currentPeriodStart = dto.currentPeriodStart ? new Date(dto.currentPeriodStart) : now;
    const intervalMonths = plan.billingInterval === 'YEARLY' ? 12 : 1;
    const currentPeriodEnd = dto.currentPeriodEnd
      ? new Date(dto.currentPeriodEnd)
      : this.addMonths(currentPeriodStart, intervalMonths);
    const trialEndsAt = dto.trialEndsAt
      ? new Date(dto.trialEndsAt)
      : status === SubscriptionStatus.TRIALING && plan.trialDays > 0
        ? this.addDays(now, plan.trialDays)
        : null;
    const cancelAt = dto.cancelAt ? new Date(dto.cancelAt) : null;
    const canceledAt =
      dto.canceledAt ? new Date(dto.canceledAt) : status === SubscriptionStatus.CANCELED ? now : null;

    if (status === SubscriptionStatus.TRIALING || status === SubscriptionStatus.ACTIVE) {
      await this.svc.prisma.providerSubscription.updateMany({
        where: { providerId: provider.id, status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] } },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
      });
    }

    const created = await this.svc.prisma.providerSubscription.create({
      data: {
        providerId: provider.id,
        planId: plan.id,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt,
        cancelAt,
        canceledAt,
        commissionRateBpsOverride: dto.commissionRateBpsOverride ?? undefined,
      },
    });
    await this.svc.audit.log({
      action: 'subscription.create',
      entity: 'ProviderSubscription',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    const existing = await this.svc.prisma.providerSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Subscription not found');

    if (dto.planId) {
      const plan = await this.svc.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan not found');
    }

    const payload: Prisma.ProviderSubscriptionUpdateInput = {};
    if (dto.planId !== undefined) {
      payload.plan = { connect: { id: dto.planId } };
    }
    if (dto.status !== undefined) payload.status = dto.status as any;
    if (dto.commissionRateBpsOverride !== undefined) {
      payload.commissionRateBpsOverride = dto.commissionRateBpsOverride ?? null;
    }
    if (dto.currentPeriodStart !== undefined) payload.currentPeriodStart = new Date(dto.currentPeriodStart);
    if (dto.currentPeriodEnd !== undefined) payload.currentPeriodEnd = new Date(dto.currentPeriodEnd);
    if (dto.trialEndsAt !== undefined) payload.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.cancelAt !== undefined) payload.cancelAt = new Date(dto.cancelAt);
    if (dto.canceledAt !== undefined) payload.canceledAt = new Date(dto.canceledAt);
    if (dto.status === SubscriptionStatus.CANCELED && !dto.canceledAt) {
      payload.canceledAt = new Date();
    }

    const updated = await this.svc.prisma.providerSubscription.update({
      where: { id },
      data: payload,
    });
    await this.svc.audit.log({
      action: 'subscription.update',
      entity: 'ProviderSubscription',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }
}
