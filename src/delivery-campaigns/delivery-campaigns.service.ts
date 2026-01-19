import { Injectable, Logger } from '@nestjs/common';
import { DeliveryCampaign, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError, ErrorCode } from '../common/errors';

export type DeliveryCampaignInput = {
  name: string;
  zoneIds: string[];
  providerIds: string[];
  deliveryPriceCents: number;
  startAt: Date;
  endAt: Date;
  isActive?: boolean;
  maxOrders?: number | null;
  maxDiscountCents?: number | null;
};

export type DeliveryCampaignListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  isActive?: boolean;
  activeNow?: boolean;
  zoneId?: string;
  providerId?: string;
};

@Injectable()
export class DeliveryCampaignsService {
  private readonly logger = new Logger(DeliveryCampaignsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(params: DeliveryCampaignListParams = {}) {
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * pageSize;
    const where: Prisma.DeliveryCampaignWhereInput = {};
    if (params.q) {
      const term = params.q.trim();
      if (term) {
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { id: { contains: term, mode: 'insensitive' } },
        ];
      }
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }
    if (params.activeNow) {
      const now = new Date();
      where.isActive = true;
      where.startAt = { lte: now };
      where.endAt = { gte: now };
    }
    if (params.zoneId) {
      where.zones = { some: { zoneId: params.zoneId } };
    }
    if (params.providerId) {
      where.providers = { some: { providerId: params.providerId } };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deliveryCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { zones: true, providers: true },
      }),
      this.prisma.deliveryCampaign.count({ where }),
    ]);

    return {
      items: items.map((campaign) => this.serialize(campaign)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string) {
    const campaign = await this.prisma.deliveryCampaign.findUnique({
      where: { id },
      include: { zones: true, providers: true },
    });
    if (!campaign) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Delivery campaign not found');
    }
    return this.serialize(campaign);
  }

  async create(input: DeliveryCampaignInput) {
    this.ensureValidWindow(input.startAt, input.endAt);
    const zoneIds = this.normalizeIds(input.zoneIds, 'zones');
    const providerIds = this.normalizeIds(input.providerIds, 'providers');
    const deliveryPriceCents = this.toNonNegativeInt(input.deliveryPriceCents);
    const maxOrders = input.maxOrders === undefined ? null : this.toNonNegativeInt(input.maxOrders);
    const maxDiscountCents =
      input.maxDiscountCents === undefined || input.maxDiscountCents === null
        ? null
        : this.toNonNegativeInt(input.maxDiscountCents);

    const created = await this.prisma.deliveryCampaign.create({
      data: {
        name: input.name.trim(),
        deliveryPriceCents,
        startAt: input.startAt,
        endAt: input.endAt,
        isActive: input.isActive ?? true,
        maxOrders,
        maxDiscountCents,
        zones: { create: zoneIds.map((zoneId) => ({ zoneId })) },
        providers: { create: providerIds.map((providerId) => ({ providerId })) },
      },
      include: { zones: true, providers: true },
    });
    this.logger.log({ msg: 'Delivery campaign created', campaignId: created.id, name: created.name });
    return this.serialize(created);
  }

  async update(id: string, input: Partial<DeliveryCampaignInput>) {
    const existing = await this.prisma.deliveryCampaign.findUnique({
      where: { id },
      include: { zones: true, providers: true },
    });
    if (!existing) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Delivery campaign not found');
    }

    const startAt = input.startAt ?? existing.startAt;
    const endAt = input.endAt ?? existing.endAt;
    this.ensureValidWindow(startAt, endAt);

    const data: Prisma.DeliveryCampaignUpdateInput = {
      name: input.name ? input.name.trim() : existing.name,
      startAt,
      endAt,
      isActive: input.isActive ?? existing.isActive,
    };
    if (input.deliveryPriceCents !== undefined) {
      data.deliveryPriceCents = this.toNonNegativeInt(input.deliveryPriceCents);
    }
    if (input.maxOrders !== undefined) {
      data.maxOrders = input.maxOrders === null ? null : this.toNonNegativeInt(input.maxOrders);
    }
    if (input.maxDiscountCents !== undefined) {
      data.maxDiscountCents =
        input.maxDiscountCents === null ? null : this.toNonNegativeInt(input.maxDiscountCents);
    }
    if (input.zoneIds) {
      const zoneIds = this.normalizeIds(input.zoneIds, 'zones');
      data.zones = {
        deleteMany: {},
        create: zoneIds.map((zoneId) => ({ zoneId })),
      };
    }
    if (input.providerIds) {
      const providerIds = this.normalizeIds(input.providerIds, 'providers');
      data.providers = {
        deleteMany: {},
        create: providerIds.map((providerId) => ({ providerId })),
      };
    }

    const updated = await this.prisma.deliveryCampaign.update({
      where: { id },
      data,
      include: { zones: true, providers: true },
    });
    this.logger.log({ msg: 'Delivery campaign updated', campaignId: updated.id, name: updated.name });
    return this.serialize(updated);
  }

  async delete(id: string) {
    const existing = await this.prisma.deliveryCampaign.findUnique({ where: { id } });
    if (!existing) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Delivery campaign not found');
    }
    await this.prisma.deliveryCampaign.delete({ where: { id } });
    this.logger.log({ msg: 'Delivery campaign deleted', campaignId: id });
    return { success: true };
  }

  async findActiveCampaign(params: { zoneId?: string | null; providerId?: string | null; at?: Date }) {
    if (!params.zoneId || !params.providerId) return null;
    const now = params.at ?? new Date();
    const candidates = await this.prisma.deliveryCampaign.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
        zones: { some: { zoneId: params.zoneId } },
        providers: { some: { providerId: params.providerId } },
      },
      orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        deliveryPriceCents: true,
        maxOrders: true,
        maxDiscountCents: true,
      },
    });
    for (const candidate of candidates) {
      if (await this.isCampaignAvailable(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private serialize(campaign: DeliveryCampaign & {
    zones?: Array<{ zoneId: string }>;
    providers?: Array<{ providerId: string }>;
  }) {
    const isActiveNow = campaign.isActive && campaign.startAt <= new Date() && campaign.endAt >= new Date();
    return {
      id: campaign.id,
      name: campaign.name,
      deliveryPriceCents: campaign.deliveryPriceCents,
      deliveryPrice: campaign.deliveryPriceCents / 100,
      startAt: campaign.startAt,
      endAt: campaign.endAt,
      isActive: campaign.isActive,
      isActiveNow,
      maxOrders: campaign.maxOrders ?? null,
      maxDiscountCents: campaign.maxDiscountCents ?? null,
      zones: (campaign.zones ?? []).map((zone) => zone.zoneId),
      providers: (campaign.providers ?? []).map((provider) => provider.providerId),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private ensureValidWindow(startAt: Date, endAt: Date) {
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Start and end dates are required');
    }
    if (startAt >= endAt) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Start date must be before end date');
    }
  }

  private normalizeIds(ids: string[], label: string) {
    const normalized = Array.from(new Set((ids ?? []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!normalized.length) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, `At least one ${label} entry is required`);
    }
    return normalized;
  }

  private toNonNegativeInt(value: any) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  }

  private async isCampaignAvailable(campaign: {
    id: string;
    maxOrders: number | null;
    maxDiscountCents: number | null;
  }) {
    if (campaign.maxOrders !== null && campaign.maxOrders !== undefined && campaign.maxOrders <= 0) {
      return false;
    }
    if (
      campaign.maxDiscountCents !== null &&
      campaign.maxDiscountCents !== undefined &&
      campaign.maxDiscountCents <= 0
    ) {
      return false;
    }
    if (!campaign.maxOrders && !campaign.maxDiscountCents) {
      return true;
    }
    const stats = await this.prisma.order.aggregate({
      where: {
        deliveryCampaignId: campaign.id,
        status: { not: OrderStatus.CANCELED },
      },
      _count: { _all: true },
      _sum: {
        deliveryBaseFeeCents: true,
        deliveryAppliedFeeCents: true,
      },
    });
    const usedOrders = stats._count._all ?? 0;
    const baseSum = stats._sum.deliveryBaseFeeCents ?? 0;
    const appliedSum = stats._sum.deliveryAppliedFeeCents ?? 0;
    const discountTotal = Math.max(0, baseSum - appliedSum);

    if (campaign.maxOrders && usedOrders >= campaign.maxOrders) {
      return false;
    }
    if (campaign.maxDiscountCents && discountTotal >= campaign.maxDiscountCents) {
      return false;
    }
    return true;
  }
}
