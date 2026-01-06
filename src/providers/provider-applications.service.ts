import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  DeliveryMode,
  ProviderApplication,
  ProviderApplicationStatus,
  ProviderStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { Prisma, ProviderSubscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventRef, AutomationEventsService } from '../automation/automation-events.service';
import { SlugService } from '../common/slug/slug.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CreateProviderApplicationDto } from './dto/provider-application.dto';
import { DomainError, ErrorCode } from '../common/errors';

export type ProviderApplicationBranchInput = {
  name?: string | null;
  city?: string | null;
  region?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  deliveryMode?: DeliveryMode | null;
  deliveryRadiusKm?: number | null;
  deliveryRatePerKmCents?: number | null;
  minDeliveryFeeCents?: number | null;
  maxDeliveryFeeCents?: number | null;
};

export type ProviderApplicationApprovalInput = {
  planId: string;
  commissionRateBpsOverride?: number | null;
  branch?: ProviderApplicationBranchInput | null;
};

@Injectable()
export class ProviderApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEventsService,
    private readonly slugs: SlugService,
    private readonly audit: AuditLogService,
  ) {}

  async createApplication(dto: CreateProviderApplicationDto) {
    const created = await this.prisma.providerApplication.create({
      data: {
        businessName: dto.businessName,
        providerType: dto.providerType,
        city: dto.city ?? null,
        region: dto.region ?? null,
        ownerName: dto.ownerName,
        phone: dto.phone,
        email: dto.email ?? null,
        deliveryMode: dto.deliveryMode ?? DeliveryMode.PLATFORM,
        notes: dto.notes ?? null,
        status: ProviderApplicationStatus.PENDING,
      },
    });

    const event = await this.automation.emit(
      'provider.application_submitted',
      this.buildAutomationPayload(created, {}),
      { dedupeKey: `provider_application:${created.id}:submitted` },
    );
    if (event) {
      await this.automation.enqueueMany([event]);
    }
    return created;
  }

  async approveApplication(applicationId: string, input: ProviderApplicationApprovalInput, actorId?: string) {
    const application = await this.prisma.providerApplication.findUnique({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Provider application not found');
    }
    if (application.status !== ProviderApplicationStatus.PENDING) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Provider application is not pending');
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (!plan.isActive) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Plan is not active');
    }

    const providerSlug = application.providerId
      ? null
      : await this.slugs.generateUniqueSlug('provider', application.businessName);
    const branchName = input.branch?.name?.trim() || 'Main Branch';
    const branchSlug = await this.slugs.generateUniqueSlug('branch', branchName);
    const now = new Date();
    const automationEvents: AutomationEventRef[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const provider = application.providerId
        ? await tx.provider.update({
            where: { id: application.providerId },
            data: {
              name: application.businessName,
              type: application.providerType,
              deliveryMode: application.deliveryMode,
              contactEmail: application.email ?? null,
              contactPhone: application.phone,
              status: ProviderStatus.ACTIVE,
            },
          })
        : await tx.provider.create({
            data: {
              name: application.businessName,
              slug: providerSlug ?? application.businessName,
              type: application.providerType,
              deliveryMode: application.deliveryMode,
              contactEmail: application.email ?? null,
              contactPhone: application.phone,
              status: ProviderStatus.ACTIVE,
            },
          });

      if (input.branch?.name || input.branch?.city || input.branch?.region || input.branch?.address) {
        await tx.provider.update({
          where: { id: provider.id },
          data: {
            deliveryRatePerKmCents: input.branch?.deliveryRatePerKmCents ?? undefined,
            minDeliveryFeeCents: input.branch?.minDeliveryFeeCents ?? undefined,
            maxDeliveryFeeCents: input.branch?.maxDeliveryFeeCents ?? undefined,
          },
        });
      }

      await tx.branch.updateMany({
        where: { providerId: provider.id, isDefault: true },
        data: { isDefault: false },
      });

      const branch = await tx.branch.create({
        data: {
          providerId: provider.id,
          name: branchName,
          slug: branchSlug,
          status: 'ACTIVE',
          address: input.branch?.address ?? null,
          city: input.branch?.city ?? application.city ?? null,
          region: input.branch?.region ?? application.region ?? null,
          lat: input.branch?.lat ?? null,
          lng: input.branch?.lng ?? null,
          deliveryMode: input.branch?.deliveryMode ?? application.deliveryMode,
          deliveryRadiusKm: input.branch?.deliveryRadiusKm ?? null,
          deliveryRatePerKmCents: input.branch?.deliveryRatePerKmCents ?? null,
          minDeliveryFeeCents: input.branch?.minDeliveryFeeCents ?? null,
          maxDeliveryFeeCents: input.branch?.maxDeliveryFeeCents ?? null,
          isDefault: true,
        },
      });

      const subscription = await this.createSubscription({
        tx,
        providerId: provider.id,
        plan,
        commissionRateBpsOverride: input.commissionRateBpsOverride ?? null,
        now,
      });

      const updatedApplication = await tx.providerApplication.update({
        where: { id: application.id },
        data: {
          status: ProviderApplicationStatus.APPROVED,
          providerId: provider.id,
          rejectionReason: null,
          reviewedAt: now,
        },
      });

      const payload = this.buildAutomationPayload(updatedApplication, {
        provider,
        plan,
        subscription,
      });
      const approvedEvent = await this.automation.emit('provider.application_approved', payload, {
        tx,
        dedupeKey: `provider_application:${application.id}:approved`,
      });
      const onboardedEvent = await this.automation.emit('provider.onboarded', payload, {
        tx,
        dedupeKey: `provider:${provider.id}:onboarded:${application.id}`,
      });
      if (approvedEvent) automationEvents.push(approvedEvent);
      if (onboardedEvent) automationEvents.push(onboardedEvent);

      return { application: updatedApplication, provider, branch, subscription };
    });

    if (automationEvents.length) {
      await this.automation.enqueueMany(automationEvents);
    }

    await this.audit.log({
      action: 'provider.application.approve',
      entity: 'ProviderApplication',
      entityId: applicationId,
      actorId,
      after: {
        status: ProviderApplicationStatus.APPROVED,
        providerId: result.provider.id,
        planId: input.planId,
      },
    });

    return result;
  }

  async rejectApplication(applicationId: string, reason?: string | null, actorId?: string) {
    const application = await this.prisma.providerApplication.findUnique({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Provider application not found');
    }
    if (application.status !== ProviderApplicationStatus.PENDING) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Provider application is not pending');
    }

    const updated = await this.prisma.providerApplication.update({
      where: { id: applicationId },
      data: {
        status: ProviderApplicationStatus.REJECTED,
        rejectionReason: reason ?? null,
        reviewedAt: new Date(),
      },
    });

    const event = await this.automation.emit(
      'provider.application_rejected',
      this.buildAutomationPayload(updated, {}),
      { dedupeKey: `provider_application:${applicationId}:rejected` },
    );
    if (event) {
      await this.automation.enqueueMany([event]);
    }

    await this.audit.log({
      action: 'provider.application.reject',
      entity: 'ProviderApplication',
      entityId: applicationId,
      actorId,
      after: { status: ProviderApplicationStatus.REJECTED, reason },
    });

    return updated;
  }

  private buildAutomationPayload(
    application: ProviderApplication,
    refs: {
      provider?: { id: string; status?: ProviderStatus } | null;
      plan?: { id: string; code: string; commissionRateBps: number } | null;
      subscription?: ProviderSubscription | null;
    },
  ) {
    return {
      application_id: application.id,
      application_status: application.status,
      provider_id: refs.provider?.id ?? application.providerId ?? null,
      provider_status: refs.provider?.status ?? null,
      business_name: application.businessName,
      provider_type: application.providerType,
      city: application.city ?? null,
      region: application.region ?? null,
      owner_name: application.ownerName,
      phone: application.phone,
      email: application.email ?? null,
      delivery_mode: application.deliveryMode,
      notes: application.notes ?? null,
      plan_id: refs.plan?.id ?? null,
      plan_code: refs.plan?.code ?? null,
      commission_rate_bps:
        refs.subscription?.commissionRateBpsOverride ?? refs.plan?.commissionRateBps ?? null,
      submitted_at: application.createdAt,
      reviewed_at: application.reviewedAt ?? null,
      updated_at: application.updatedAt,
    };
  }

  private async createSubscription(params: {
    tx: Prisma.TransactionClient;
    providerId: string;
    plan: { id: string; billingInterval: BillingInterval; trialDays: number };
    commissionRateBpsOverride: number | null;
    now: Date;
  }) {
    const status =
      params.plan.trialDays && params.plan.trialDays > 0
        ? SubscriptionStatus.TRIALING
        : SubscriptionStatus.ACTIVE;
    const currentPeriodStart = params.now;
    const intervalMonths = params.plan.billingInterval === BillingInterval.YEARLY ? 12 : 1;
    const currentPeriodEnd = this.addMonths(currentPeriodStart, intervalMonths);
    const trialEndsAt =
      status === SubscriptionStatus.TRIALING && params.plan.trialDays > 0
        ? this.addDays(params.now, params.plan.trialDays)
        : null;

    if (status === SubscriptionStatus.TRIALING || status === SubscriptionStatus.ACTIVE) {
      await params.tx.providerSubscription.updateMany({
        where: {
          providerId: params.providerId,
          status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] },
        },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: params.now },
      });
    }

    return params.tx.providerSubscription.create({
      data: {
        providerId: params.providerId,
        planId: params.plan.id,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt,
        commissionRateBpsOverride: params.commissionRateBpsOverride ?? undefined,
      },
    });
  }

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
}
