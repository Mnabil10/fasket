import { Injectable } from '@nestjs/common';
import {
  CommissionConfig,
  CommissionDiscountRule,
  CommissionMode,
  CommissionScope,
  FeeRecipient,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ResolvedCommissionConfig = {
  base: CommissionConfig | null;
  platform: CommissionConfig | null;
  categoryOverrides: Map<string, CommissionConfig>;
};

const DEFAULT_CONFIG: Omit<
  CommissionConfig,
  'id' | 'createdAt' | 'updatedAt' | 'providerId' | 'categoryId'
> = {
  scope: CommissionScope.PLATFORM,
  mode: CommissionMode.HYBRID,
  commissionRateBps: null,
  minCommissionCents: 0,
  maxCommissionCents: null,
  deliveryFeeRecipient: FeeRecipient.PLATFORM,
  gatewayFeeRecipient: FeeRecipient.PLATFORM,
  discountRule: CommissionDiscountRule.AFTER_DISCOUNT,
  gatewayFeeRateBps: null,
  gatewayFeeFlatCents: null,
  payoutHoldDays: 0,
  minimumPayoutCents: 0,
};

@Injectable()
export class CommissionConfigService {
  constructor(private readonly prisma: PrismaService) {}

  getDefaultConfig(): CommissionConfig {
    return {
      id: 'default',
      providerId: null,
      categoryId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...DEFAULT_CONFIG,
    };
  }

  async resolveConfigs(
    providerId: string,
    categoryIds: string[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ResolvedCommissionConfig> {
    const ids = Array.from(new Set(categoryIds.filter(Boolean)));
    const configs = await client.commissionConfig.findMany({
      where: {
        OR: [
          { scope: CommissionScope.PLATFORM },
          { scope: CommissionScope.PROVIDER, providerId },
          ...(ids.length
            ? [
                { scope: CommissionScope.CATEGORY, categoryId: { in: ids } },
                { scope: CommissionScope.PROVIDER_CATEGORY, providerId, categoryId: { in: ids } },
              ]
            : []),
        ],
      },
    });

    const platform = configs.find((c) => c.scope === CommissionScope.PLATFORM) ?? null;
    const provider = configs.find((c) => c.scope === CommissionScope.PROVIDER && c.providerId === providerId) ?? null;
    const categoryOverrides = new Map<string, CommissionConfig>();

    for (const categoryId of ids) {
      const providerCategory =
        configs.find(
          (c) =>
            c.scope === CommissionScope.PROVIDER_CATEGORY &&
            c.providerId === providerId &&
            c.categoryId === categoryId,
        ) ?? null;
      const category =
        configs.find(
          (c) => c.scope === CommissionScope.CATEGORY && c.categoryId === categoryId,
        ) ?? null;
      const override = providerCategory ?? category;
      if (override) {
        categoryOverrides.set(categoryId, override);
      }
    }

    return {
      base: provider ?? platform,
      platform,
      categoryOverrides,
    };
  }

  resolveEffectiveBaseConfig(base: CommissionConfig | null): CommissionConfig {
    return base ?? this.getDefaultConfig();
  }
}
