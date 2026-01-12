import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryMode,
  DeliveryFailureReason,
  OrderGroupStatus,
  OrderSplitFailurePolicy,
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
  ProductOptionGroupType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderSplitFailurePolicyDto, PaymentMethodDto } from './dto';
import { CreateGuestOrderDto, GuestOrderQuoteDto } from './dto/guest-order.dto';
import { SettingsService } from '../settings/settings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DomainError, ErrorCode } from '../common/errors';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheService } from '../common/cache/cache.service';
import { AutomationEventsService, AutomationEventRef } from '../automation/automation-events.service';
import { BillingService } from '../billing/billing.service';
import { FinanceService } from '../finance/finance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeWhatsappLanguage, WhatsappTemplateLanguage } from '../whatsapp/templates/whatsapp.templates';
import { OtpService } from '../otp/otp.service';
import { normalizePhoneToE164 } from '../common/utils/phone.util';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    address: true;
    driver: {
      select: {
        id: true;
        fullName: true;
        phone: true;
      };
    };
    items: {
      select: {
        id: true;
        productId: true;
        productNameSnapshot: true;
        priceSnapshotCents: true;
        qty: true;
      };
    };
  };
}>;

type PublicStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'
  | 'CANCELED';

type StatusTransitionContext = {
  deliveryMode?: DeliveryMode | null;
  driverId?: string | null;
};

type GuestOrderItemInput = {
  productId: string;
  qty: number;
  branchId?: string | null;
  options?: { optionId: string; qty?: number }[];
};

type GuestAddressInput = {
  fullAddress: string;
  city?: string;
  region?: string;
  street?: string;
  building?: string;
  apartment?: string;
  notes?: string;
  zoneId?: string;
  lat?: number | null;
  lng?: number | null;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly listTtl = Number(process.env.ORDER_LIST_CACHE_TTL ?? 30);
  private readonly receiptTtl = Number(process.env.ORDER_RECEIPT_CACHE_TTL ?? 60);
  private readonly defaultProviderId = 'prov_default';
  private readonly defaultBranchId = 'branch_default';
  private readonly serviceFeeCents = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditLogService,
    private readonly cache: CacheService,
    private readonly automation: AutomationEventsService,
    private readonly billing: BillingService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
    private readonly otp: OtpService,
  ) {}

  async list(userId: string) {
    const cacheKey = this.cache.buildKey('orders:list', userId);
    const orders = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            code: true,
            totalCents: true,
            status: true,
            createdAt: true,
            loyaltyPointsUsed: true,
            loyaltyDiscountCents: true,
            loyaltyPointsEarned: true,
          },
        }),
      this.listTtl,
    );
    return orders.map((order) => ({
      id: order.id,
      code: order.code,
      totalCents: order.totalCents,
      status: this.toPublicStatus(order.status),
      createdAt: order.createdAt,
      loyaltyPointsUsed: order.loyaltyPointsUsed ?? 0,
      loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
      loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
    }));
  }

  async listOrderGroups(userId: string) {
    const groups = await this.prisma.orderGroup.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        orders: {
          select: {
            id: true,
            code: true,
            status: true,
            totalCents: true,
            subtotalCents: true,
            shippingFeeCents: true,
            serviceFeeCents: true,
            discountCents: true,
            providerId: true,
            branchId: true,
            createdAt: true,
            provider: { select: { id: true, name: true, nameAr: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return groups.map((group) => {
      const totals = this.computeGroupTotals(group.orders);
      const providers = group.orders.map((order) => ({
        orderId: order.id,
        providerId: order.providerId,
        providerName: order.provider?.name ?? null,
        providerNameAr: order.provider?.nameAr ?? null,
        status: this.toPublicStatus(order.status),
      }));
      const orders = group.orders.map((order) => ({
        id: order.id,
        code: order.code ?? order.id,
        status: this.toPublicStatus(order.status),
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents ?? 0,
        serviceFeeCents:
          order.serviceFeeCents ??
          this.inferServiceFeeCents({
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            discountCents: order.discountCents ?? 0,
            totalCents: order.totalCents,
          }),
        discountCents: order.discountCents ?? 0,
        totalCents: order.totalCents,
        providerId: order.providerId ?? null,
        branchId: order.branchId ?? null,
        providerName: order.provider?.name ?? null,
        providerNameAr: order.provider?.nameAr ?? null,
        createdAt: order.createdAt,
      }));
      return {
        orderGroupId: group.id,
        code: group.code,
        status: this.summarizeGroupStatus(group.orders.map((o) => o.status)),
        subtotalCents: totals.subtotalCents,
        shippingFeeCents: totals.shippingFeeCents,
        serviceFeeCents: totals.serviceFeeCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        createdAt: group.createdAt,
        providers,
        orders,
      };
    });
  }

  async getOrderGroupDetail(userId: string, orderGroupId: string) {
    const group = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId },
      include: {
        address: true,
        orders: {
          include: {
            provider: { select: { id: true, name: true, nameAr: true } },
            items: {
              select: {
                id: true,
                productId: true,
                productNameSnapshot: true,
                priceSnapshotCents: true,
                qty: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order group not found', 404);
    }
    const totals = this.computeGroupTotals(group.orders);
    const providerOrders = group.orders.map((order) => ({
      id: order.id,
      code: order.code ?? order.id,
      providerId: order.providerId,
      providerName: order.provider?.name ?? null,
      providerNameAr: order.provider?.nameAr ?? null,
      status: this.toPublicStatus(order.status),
      subtotalCents: order.subtotalCents,
      shippingFeeCents: order.shippingFeeCents ?? 0,
      serviceFeeCents:
        order.serviceFeeCents ??
        this.inferServiceFeeCents({
          subtotalCents: order.subtotalCents,
          shippingFeeCents: order.shippingFeeCents ?? 0,
          discountCents: order.discountCents ?? 0,
          totalCents: order.totalCents,
        }),
      discountCents: order.discountCents ?? 0,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      deliveryFailedAt: order.deliveryFailedAt ?? null,
      deliveryFailedReason: order.deliveryFailedReason ?? null,
      deliveryFailedNote: order.deliveryFailedNote ?? null,
      items: (order.items || []).map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        priceSnapshotCents: item.priceSnapshotCents,
        qty: item.qty,
      })),
    }));
    return {
      orderGroupId: group.id,
      code: group.code,
      status: this.summarizeGroupStatus(group.orders.map((o) => o.status)),
      subtotalCents: totals.subtotalCents,
      shippingFeeCents: totals.shippingFeeCents,
      serviceFeeCents: totals.serviceFeeCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      createdAt: group.createdAt,
      address: group.address ?? null,
      providerOrders,
      orders: providerOrders,
    };
  }

  async cancelOrderGroup(userId: string, orderGroupId: string) {
    const group = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId },
      include: {
        orders: {
          include: { provider: { select: { id: true, name: true, nameAr: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order group not found', 404);
    }
    const cancelableStatuses = new Set<OrderStatus>([OrderStatus.PENDING, OrderStatus.CONFIRMED]);
    const cancelledProviders: Array<{ orderId: string; providerId: string | null; providerName: string | null }> = [];
    const blockedProviders: Array<{ orderId: string; providerId: string | null; providerName: string | null; status: PublicStatus }> = [];

    for (const order of group.orders) {
      if (order.status === OrderStatus.CANCELED) {
        cancelledProviders.push({
          orderId: order.id,
          providerId: order.providerId ?? null,
          providerName: order.provider?.name ?? null,
        });
        continue;
      }
      if (!cancelableStatuses.has(order.status)) {
        blockedProviders.push({
          orderId: order.id,
          providerId: order.providerId ?? null,
          providerName: order.provider?.name ?? null,
          status: this.toPublicStatus(order.status),
        });
        continue;
      }
      await this.cancelOrder(userId, order.id);
      cancelledProviders.push({
        orderId: order.id,
        providerId: order.providerId ?? null,
        providerName: order.provider?.name ?? null,
      });
    }

    const refreshed = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId },
      include: { orders: true },
    });

    const remainingOrders = refreshed?.orders ?? [];
    const totals = this.computeGroupTotals(remainingOrders);
    const activeOrders = remainingOrders.filter((order) => order.status !== OrderStatus.CANCELED);
    const groupUpdate: Prisma.OrderGroupUpdateInput = {
      subtotalCents: totals.subtotalCents,
      shippingFeeCents: totals.shippingFeeCents,
      serviceFeeCents: totals.serviceFeeCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
    };
    if (activeOrders.length === 0) {
      groupUpdate.status = OrderGroupStatus.CANCELED;
    }
    await this.prisma.orderGroup.update({
      where: { id: orderGroupId },
      data: groupUpdate,
    });

    return {
      orderGroupId,
      cancelledProviders,
      blockedProviders,
      totals,
      status: this.summarizeGroupStatus(remainingOrders.map((o) => o.status)),
    };
  }

  async detail(userId: string, id: string) {
    const cacheKey = this.cache.buildKey('orders:detail', id, userId);
    const order = await this.cache.wrap(
      cacheKey,
      () =>
        this.prisma.order.findFirst({
          where: { id, userId },
          include: {
            address: true,
            driver: {
              select: { id: true, fullName: true, phone: true },
            },
            items: {
              select: {
                id: true,
                productId: true,
                productNameSnapshot: true,
                priceSnapshotCents: true,
                qty: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        }),
      this.listTtl,
    );
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const zone = order.deliveryZoneId
      ? await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true })
      : undefined;
    return this.toOrderDetail(order, zone);
  }

  async getOrderTimeline(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        createdAt: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, from: true, to: true, note: true, createdAt: true },
        },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }

    const timeline = [
      {
        id: `${order.id}-created`,
        from: null,
        to: this.toPublicStatus(OrderStatus.PENDING),
        note: 'Order placed',
        createdAt: order.createdAt,
      },
      ...order.statusHistory.map((entry) => ({
        id: entry.id,
        from: entry.from ? this.toPublicStatus(entry.from as OrderStatus) : null,
        to: this.toPublicStatus(entry.to as OrderStatus),
        note: entry.note ?? null,
        createdAt: entry.createdAt,
      })),
    ];

    return timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getOrderDriverLocation(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    return this.findLatestDriverLocation(order.driverId);
  }

  async getAdminOrderHistory(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const items = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((entry) => ({
      id: entry.id,
      at: entry.createdAt,
      from: entry.from ?? undefined,
      to: entry.to,
      actor: entry.actorId ?? undefined,
      note: entry.note ?? undefined,
    }));
  }

  async getOrderTransitions(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, deliveryMode: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const transitions = this.getAllowedTransitions(order.status, {
      deliveryMode: order.deliveryMode,
      driverId: order.driverId,
    });
    return transitions.map((to) => ({
      from: order.status,
      to,
      label: this.formatStatusLabel(to),
    }));
  }

  async getAdminOrderDriverLocation(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    return this.findLatestDriverLocation(order.driverId);
  }

  async create(userId: string, payload: CreateOrderDto) {
    if (payload.deliveryTermsAccepted !== true) {
      throw new DomainError(ErrorCode.DELIVERY_TERMS_NOT_ACCEPTED, 'Delivery terms must be accepted');
    }
    const idempotencyKey = payload.idempotencyKey?.trim() || null;
    const splitPolicy =
      (payload.splitFailurePolicy ?? OrderSplitFailurePolicyDto.PARTIAL) as OrderSplitFailurePolicy;
    const paymentMethod = payload.paymentMethod ?? PaymentMethodDto.COD;
    const savedPaymentMethod = await this.resolveSavedPaymentMethod(userId, paymentMethod, payload.paymentMethodId);
    await this.assertPaymentMethodEnabled(paymentMethod, {
      userId,
      idempotencyKey,
      walletProvider: savedPaymentMethod?.walletProvider ?? null,
    });
    const automationEvents: AutomationEventRef[] = [];

    if (idempotencyKey) {
      const existingGroup = await this.prisma.orderGroup.findFirst({
        where: { userId, idempotencyKey },
        select: { id: true },
      });
      if (existingGroup) {
        return this.getOrderGroupSummary(userId, existingGroup.id);
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId },
          include: { items: { include: { options: true } } },
        });
        if (!cart || cart.items.length === 0) {
          throw new DomainError(ErrorCode.CART_EMPTY, 'Cart is empty');
        }
        const couponCode = payload.couponCode ?? cart.couponCode ?? undefined;

        const productIds = cart.items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, status: ProductStatus.ACTIVE, deletedAt: null },
          select: {
            id: true,
            name: true,
            stock: true,
            priceCents: true,
            salePriceCents: true,
            costPriceCents: true,
            providerId: true,
            optionGroups: {
              where: { isActive: true },
              include: { options: { where: { isActive: true } } },
            },
          },
        });
        if (products.length !== productIds.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'One or more products are unavailable');
        }

        const productMap = new Map(products.map((product) => [product.id, product]));
        const address = await tx.address.findFirst({ where: { id: payload.addressId, userId } });
        if (!address) {
          throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Invalid address');
        }
        const distancePricingEnabled = this.settings.isDistancePricingEnabled();
        if (
          distancePricingEnabled &&
          (address.lat === null ||
            address.lat === undefined ||
            address.lng === null ||
            address.lng === undefined)
        ) {
          throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Address location is required');
        }

        const explicitBranchIds = Array.from(
          new Set(cart.items.map((item) => item.branchId).filter(Boolean) as string[]),
        );
        const explicitBranches = explicitBranchIds.length
          ? await tx.branch.findMany({
              where: { id: { in: explicitBranchIds } },
              include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
            })
          : [];
        const branchById = new Map(explicitBranches.map((branch) => [branch.id, branch]));

        const providerIdsNeeded = new Set<string>();
        for (const item of cart.items) {
          if (!item.branchId) {
            const product = productMap.get(item.productId);
            if (product) {
              providerIdsNeeded.add(product.providerId ?? this.defaultProviderId);
            }
          }
        }

        const providerBranches = providerIdsNeeded.size
          ? await tx.branch.findMany({
              where: { providerId: { in: Array.from(providerIdsNeeded) }, status: 'ACTIVE' },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
              include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
            })
          : [];
        const defaultBranchByProvider = new Map<string, (typeof providerBranches)[number]>();
        for (const branch of providerBranches) {
          if (!defaultBranchByProvider.has(branch.providerId)) {
            defaultBranchByProvider.set(branch.providerId, branch);
          }
        }
        const fallbackBranch = await tx.branch.findUnique({
          where: { id: this.defaultBranchId },
          include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
        });

        const branchErrors = new Map<string, string>();
        const resolvedItems: Array<{
          cartItemId: string;
          product: {
            id: string;
            name: string;
            stock: number;
            priceCents: number;
            salePriceCents: number | null;
            costPriceCents: number | null;
            providerId: string | null;
            optionGroups: {
              id: string;
              type: ProductOptionGroupType;
              minSelected: number;
              maxSelected: number | null;
              isActive: boolean;
              options: {
                id: string;
                name: string;
                nameAr: string | null;
                priceCents: number;
                maxQtyPerOption: number | null;
                isActive: boolean;
              }[];
            }[];
          };
          branch: {
            id: string;
            providerId: string;
            status: string;
            deliveryMode: DeliveryMode | null;
            provider?: { id: string; deliveryMode: DeliveryMode; status: string } | null;
          };
          qty: number;
          options: { optionId: string; qty: number }[];
        }> = [];

        for (const item of cart.items) {
          const product = productMap.get(item.productId);
          if (!product) {
            branchErrors.set(item.branchId ?? 'unknown', 'Product unavailable');
            continue;
          }
          const branch =
            (item.branchId ? branchById.get(item.branchId) : undefined) ??
            defaultBranchByProvider.get(product.providerId ?? this.defaultProviderId) ??
            (fallbackBranch ?? undefined);
          if (!branch || branch.status !== 'ACTIVE') {
            branchErrors.set(item.branchId ?? branch?.id ?? 'unknown', 'Branch unavailable');
            continue;
          }
          if (branch.provider && branch.provider.status !== 'ACTIVE') {
            branchErrors.set(item.branchId ?? branch.id, 'Provider unavailable');
            continue;
          }
          if (product.providerId && branch.providerId !== product.providerId) {
            branchErrors.set(branch.id, 'Branch does not match product provider');
            continue;
          }
          if (!item.branchId) {
            await tx.cartItem.update({ where: { id: item.id }, data: { branchId: branch.id } });
          }
          resolvedItems.push({
            cartItemId: item.id,
            product,
            branch,
            qty: item.qty,
            options: this.normalizeOptionInputs(
              item.options?.map((entry) => ({ optionId: entry.optionId, qty: entry.qty })) ?? [],
            ),
          });
        }

        const branchPairs = resolvedItems.map((item) => ({
          branchId: item.branch.id,
          productId: item.product.id,
        }));
        const branchProducts = branchPairs.length
          ? await tx.branchProduct.findMany({
              where: { OR: branchPairs },
            })
          : [];
        const branchProductMap = new Map(
          branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
        );

        const validItems: Array<{
          cartItemId: string;
          branchId: string;
          providerId: string;
          productId: string;
          productName: string;
          qty: number;
          priceCents: number;
          costCents: number;
          options: Array<{ optionId: string; name: string; nameAr: string | null; priceCents: number; qty: number }>;
          branch: {
            id: string;
            providerId: string;
            deliveryMode: DeliveryMode | null;
            provider?: { id: string; deliveryMode: DeliveryMode } | null;
          };
        }> = [];

        for (const item of resolvedItems) {
          const branchProduct = branchProductMap.get(`${item.branch.id}:${item.product.id}`);
          if (!branchProduct || !branchProduct.isActive) {
            branchErrors.set(item.branch.id, 'Product unavailable in this branch');
            continue;
          }
          const stock = this.resolveEffectiveStock(item.product.stock, branchProduct.stock);
          if (stock <= 0) {
            branchErrors.set(item.branch.id, `Out of stock: ${item.product.name}`);
            continue;
          }
          if (stock < item.qty) {
            branchErrors.set(item.branch.id, `Insufficient stock for ${item.product.name}`);
            continue;
          }
          if (!item.product.costPriceCents || item.product.costPriceCents <= 0) {
            this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: item.product.id });
          }
          const basePrice =
            branchProduct.salePriceCents ??
            branchProduct.priceCents ??
            item.product.salePriceCents ??
            item.product.priceCents;
          let optionSelection: {
            optionsTotalCents: number;
            options: Array<{ optionId: string; name: string; nameAr: string | null; priceCents: number; qty: number }>;
          };
          try {
            optionSelection = this.resolveOptionSelectionsFromProduct(item.product, item.options);
          } catch (error: any) {
            branchErrors.set(item.branch.id, error?.userMessage ?? error?.message ?? 'Invalid product options');
            continue;
          }
          const priceCents = basePrice + optionSelection.optionsTotalCents;
          validItems.push({
            cartItemId: item.cartItemId,
            branchId: item.branch.id,
            providerId: item.branch.providerId,
            productId: item.product.id,
            productName: item.product.name,
            qty: item.qty,
            priceCents,
            costCents: item.product.costPriceCents ?? 0,
            options: optionSelection.options,
            branch: item.branch,
          });
        }

        if (branchErrors.size > 0 && splitPolicy === OrderSplitFailurePolicy.CANCEL_GROUP) {
          const message = Array.from(branchErrors.values())[0] ?? 'Some items are unavailable';
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, message);
        }

        const filteredItems = validItems.filter((item) => !branchErrors.has(item.branchId));
        if (!filteredItems.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
        }

        const grouped = new Map<
          string,
          { branch: (typeof filteredItems)[number]['branch']; providerId: string; items: typeof filteredItems; subtotalCents: number }
        >();
        for (const item of filteredItems) {
          const existing = grouped.get(item.branchId);
          if (!existing) {
            grouped.set(item.branchId, {
              branch: item.branch,
              providerId: item.providerId,
              items: [item],
              subtotalCents: item.priceCents * item.qty,
            });
          } else {
            existing.items.push(item);
            existing.subtotalCents += item.priceCents * item.qty;
          }
        }

        const groupEntries = Array.from(grouped.entries());
        const providerIds = new Set(groupEntries.map(([, group]) => group.providerId));
        if (providerIds.size > 1) {
          throw new DomainError(ErrorCode.CART_PROVIDER_MISMATCH, 'Cart contains items from multiple providers');
        }
        if (groupEntries.length > 1) {
          throw new DomainError(ErrorCode.CART_BRANCH_MISMATCH, 'Cart contains items from multiple branches');
        }

        if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0 && grouped.size > 1) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'Loyalty redemption is not supported for multi-provider orders',
          );
        }

        const subtotalCentsTotal = Array.from(grouped.values()).reduce((sum, group) => sum + group.subtotalCents, 0);
        let discountCents = 0;
        let couponScope: { scope?: string | null; providerId?: string | null; branchId?: string | null } | null = null;
        if (couponCode) {
          const coupon = await tx.coupon.findFirst({ where: { code: couponCode, isActive: true } });
          const now = new Date();
          const active =
            coupon &&
            (!coupon.startsAt || coupon.startsAt <= now) &&
            (!coupon.endsAt || coupon.endsAt >= now) &&
            (!coupon.minOrderCents || subtotalCentsTotal >= coupon.minOrderCents);
          if (!active || !coupon) {
            throw new DomainError(ErrorCode.COUPON_EXPIRED, 'Coupon is invalid or expired');
          }

          couponScope = {
            scope: coupon.scope ?? null,
            providerId: coupon.providerId ?? null,
            branchId: coupon.branchId ?? null,
          };
          if (coupon.scope === 'PROVIDER' && coupon.providerId) {
            const allProviderIds = Array.from(grouped.values()).map((group) => group.providerId);
            if (allProviderIds.some((pid) => pid !== coupon.providerId)) {
              throw new DomainError(ErrorCode.COUPON_INVALID, 'Coupon is not valid for this provider');
            }
          }
          if (coupon.scope === 'BRANCH' && coupon.branchId) {
            const allBranchIds = Array.from(grouped.keys());
            if (allBranchIds.some((bid) => bid !== coupon.branchId)) {
              throw new DomainError(ErrorCode.COUPON_INVALID, 'Coupon is not valid for this branch');
            }
          }

          if (coupon.type === 'PERCENT') {
            discountCents = Math.floor((subtotalCentsTotal * (coupon.valueCents ?? 0)) / 100);
          } else {
            discountCents = coupon.valueCents ?? 0;
          }
          if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
            discountCents = coupon.maxDiscountCents;
          }
          if (discountCents > subtotalCentsTotal) {
            discountCents = subtotalCentsTotal;
          }
          discountCents = Math.max(0, Math.round(discountCents));
        }

        const discountEntries = groupEntries;
        const discountByBranch = this.allocateDiscounts(discountCents, discountEntries);

        const shippingByBranch = new Map<
          string,
          {
            fee: number;
            distanceKm: number | null;
            ratePerKmCents: number | null;
            etaMinutes?: number | null;
            estimatedDeliveryTime?: string | null;
            deliveryZoneId?: string | null;
            deliveryZoneName?: string | null;
          }
        >();
        for (const [branchId] of groupEntries) {
          const quote = await this.settings.computeBranchDeliveryQuote({
            branchId,
            addressLat: address.lat ?? null,
            addressLng: address.lng ?? null,
            zoneId: address.zoneId ?? null,
            subtotalCents: grouped.get(branchId)?.subtotalCents ?? 0,
          });
          shippingByBranch.set(branchId, {
            fee: quote.shippingFeeCents,
            distanceKm: distancePricingEnabled ? quote.distanceKm : null,
            ratePerKmCents: distancePricingEnabled ? quote.ratePerKmCents : null,
            etaMinutes: quote.etaMinutes ?? null,
            estimatedDeliveryTime: quote.estimatedDeliveryTime ?? null,
            deliveryZoneId: quote.deliveryZoneId ?? null,
            deliveryZoneName: quote.deliveryZoneName ?? null,
          });
        }

        const branchIds = groupEntries.map(([branchId]) => branchId);
        const { totalFeeCents: shippingFeeCentsTotal, primaryBranchId } = this.resolveCombinedShippingFee(
          branchIds,
          shippingByBranch,
        );
        const serviceFeeCentsTotal = this.calculateServiceFeeCents(groupEntries.length);

        const scheduling = await this.resolveDeliveryWindowSelection({
          branch: groupEntries[0][1].branch,
          subtotalCents: groupEntries[0][1].subtotalCents,
          deliveryWindowId: payload.deliveryWindowId,
          scheduledAt: payload.scheduledAt,
        });

        const orderGroup = await tx.orderGroup.create({
          data: {
            userId,
            idempotencyKey,
            addressId: address.id,
            status: 'PENDING',
            splitFailurePolicy: splitPolicy,
            paymentMethod: paymentMethod as PaymentMethod,
            paymentMethodId: savedPaymentMethod?.id ?? null,
            deliveryTermsAccepted: true,
            deliveryWindowId: scheduling.deliveryWindowId ?? null,
            scheduledAt: scheduling.scheduledAt ?? null,
            couponCode,
            subtotalCents: subtotalCentsTotal,
            shippingFeeCents: shippingFeeCentsTotal,
            serviceFeeCents: serviceFeeCentsTotal,
            discountCents,
            totalCents: subtotalCentsTotal + shippingFeeCentsTotal + serviceFeeCentsTotal - discountCents,
          },
        });

        const createdOrders: { id: string }[] = [];
        for (const [branchId, group] of groupEntries) {
          const discountForBranch = discountByBranch.get(branchId) ?? 0;
          const shippingQuote = shippingByBranch.get(branchId);
          const deliveryMode =
            group.branch.deliveryMode ??
            group.branch.provider?.deliveryMode ??
            DeliveryMode.PLATFORM;
          const deliveryDistanceKm = distancePricingEnabled ? shippingQuote?.distanceKm ?? null : null;
          const deliveryRatePerKmCents = distancePricingEnabled ? shippingQuote?.ratePerKmCents ?? null : null;
          const shippingFeeCents =
            groupEntries.length > 1 ? (branchId === primaryBranchId ? shippingFeeCentsTotal : 0) : shippingQuote?.fee ?? 0;
          const deliveryEtaMinutes = shippingQuote?.etaMinutes ?? null;
          const estimatedDeliveryTime = shippingQuote?.estimatedDeliveryTime ?? null;
          const totalCents =
            group.subtotalCents + shippingFeeCents + this.serviceFeeCents - discountForBranch;

          const code = await this.generateOrderCode(tx);
          const order = await tx.order.create({
            data: {
              userId,
              code,
              status: OrderStatus.PENDING,
              paymentMethod: paymentMethod as PaymentMethod,
              paymentMethodId: savedPaymentMethod?.id ?? null,
              deliveryTermsAccepted: true,
              deliveryWindowId: scheduling.deliveryWindowId ?? null,
              scheduledAt: scheduling.scheduledAt ?? null,
              subtotalCents: group.subtotalCents,
              shippingFeeCents,
              serviceFeeCents: this.serviceFeeCents,
              discountCents: discountForBranch,
              totalCents,
              loyaltyDiscountCents: 0,
              loyaltyPointsUsed: 0,
              addressId: address.id,
              cartId: cart.id,
              notes: payload.note,
              couponCode,
              orderGroupId: orderGroup.id,
              providerId: group.providerId,
              branchId,
              deliveryMode,
              deliveryDistanceKm,
              deliveryRatePerKmCents,
              deliveryEtaMinutes,
              estimatedDeliveryTime,
              items: {
                create: group.items.map((item) => {
                  const optionCreates = item.options.map((option) => ({
                    optionId: option.optionId,
                    optionNameSnapshot: option.name,
                    optionNameArSnapshot: option.nameAr ?? null,
                    priceSnapshotCents: option.priceCents,
                    qty: option.qty,
                  }));
                  return {
                    productId: item.productId,
                    productNameSnapshot: item.productName,
                    priceSnapshotCents: item.priceCents,
                    unitPriceCents: item.priceCents,
                    unitCostCents: item.costCents ?? 0,
                    lineTotalCents: item.priceCents * item.qty,
                    lineProfitCents: (item.priceCents - (item.costCents ?? 0)) * item.qty,
                    qty: item.qty,
                    options: optionCreates.length ? { create: optionCreates } : undefined,
                  };
                }),
              },
            },
            select: { id: true },
          });
          createdOrders.push(order);

          for (const item of group.items) {
            const branchProduct = branchProductMap.get(`${branchId}:${item.productId}`);
            let updatedProductStock = false;
            if (branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
              const updated = await tx.branchProduct.updateMany({
                where: {
                  branchId,
                  productId: item.productId,
                  isActive: true,
                  stock: { gte: item.qty },
                },
                data: { stock: { decrement: item.qty } },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ErrorCode.CART_PRODUCT_UNAVAILABLE,
                  `Insufficient stock for ${item.productName}`,
                );
              }
            } else {
              const updated = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  status: ProductStatus.ACTIVE,
                  deletedAt: null,
                  stock: { gte: item.qty },
                },
                data: { stock: { decrement: item.qty } },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ErrorCode.CART_PRODUCT_UNAVAILABLE,
                  `Insufficient stock for ${item.productName}`,
                );
              }
              updatedProductStock = true;
            }

            const product = productMap.get(item.productId);
            if (product && updatedProductStock) {
              const previousStock = product.stock ?? 0;
              const newStock = previousStock - item.qty;
              await tx.productStockLog.create({
                data: {
                  productId: item.productId,
                  previousStock,
                  newStock,
                  delta: newStock - previousStock,
                  reason: 'order.checkout',
                  actorId: userId,
                },
              });
              product.stock = newStock;
            }
          }

            const eventPayload = await this.buildOrderEventPayload(order.id, tx);
          const createdEvent = await this.automation.emit('order.created', eventPayload, {
            tx,
            dedupeKey: `order:${order.id}:${OrderStatus.PENDING}:created`,
          });
          automationEvents.push(createdEvent);
        }

        if (payload.loyaltyPointsToRedeem && payload.loyaltyPointsToRedeem > 0 && createdOrders.length === 1) {
          const redemption = await this.loyalty.redeemPoints({
            userId,
            pointsToRedeem: payload.loyaltyPointsToRedeem,
            subtotalCents: Math.max(subtotalCentsTotal - discountCents, 0),
            tx,
            orderId: createdOrders[0].id,
          });
          if (redemption.discountCents > 0) {
            await tx.order.update({
              where: { id: createdOrders[0].id },
              data: {
                loyaltyDiscountCents: redemption.discountCents,
                loyaltyPointsUsed: redemption.pointsUsed,
                totalCents: Math.max(
                  subtotalCentsTotal + shippingFeeCentsTotal + serviceFeeCentsTotal - discountCents - redemption.discountCents,
                  0,
                ),
              },
            });
            await tx.orderGroup.update({
              where: { id: orderGroup.id },
              data: {
                totalCents: Math.max(
                  subtotalCentsTotal + shippingFeeCentsTotal + serviceFeeCentsTotal - discountCents - redemption.discountCents,
                  0,
                ),
              },
            });
          }
        }

        const orderedCartItemIds = filteredItems.map((item) => item.cartItemId);
        if (orderedCartItemIds.length) {
          await tx.cartItem.deleteMany({ where: { id: { in: orderedCartItemIds } } });
        }
        if (cart.couponCode) {
          await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        }

        return {
          orderGroupId: orderGroup.id,
          orderIds: createdOrders.map((order) => order.id),
          skippedBranchIds: Array.from(branchErrors.keys()),
          couponScope,
        };
      });

        await this.automation.enqueueMany(automationEvents);
        for (const orderId of result.orderIds) {
          await this.clearCachesForOrder(orderId, userId);
          await this.notifyOrderCreatedWhatsapp(orderId);
        }
        this.logger.log({ msg: 'Order created', orderGroupId: result.orderGroupId, userId });
      if (result.orderIds.length === 1) {
        return this.detail(userId, result.orderIds[0]);
      }
      const summary = await this.getOrderGroupSummary(userId, result.orderGroupId);
      return {
        ...summary,
        skippedBranchIds: result.skippedBranchIds,
      };
    } catch (error) {
      const err = error as Error;
      const errorCode = error instanceof DomainError ? error.code : (error as any)?.code;
      this.logger.error(
        {
          msg: 'Checkout failed',
          userId,
          idempotencyKey,
          paymentMethod,
          errorCode,
          errorMessage: err?.message,
        },
        err?.stack,
      );
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingGroup = await this.prisma.orderGroup.findFirst({
          where: { userId, idempotencyKey },
          select: { id: true },
        });
        if (existingGroup) {
          return this.getOrderGroupSummary(userId, existingGroup.id);
        }
      }
      await this.rollbackStockFromCart(userId).catch(() => undefined);
      throw error;
    }
  }

  async quoteGuestOrder(payload: GuestOrderQuoteDto) {
    const splitPolicy =
      (payload.splitFailurePolicy ?? OrderSplitFailurePolicyDto.PARTIAL) as OrderSplitFailurePolicy;
    const address = payload.address as GuestAddressInput;
    const distancePricingEnabled = this.settings.isDistancePricingEnabled();
    if (
      distancePricingEnabled &&
      (!Number.isFinite(address.lat) || !Number.isFinite(address.lng))
    ) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Address location is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const { grouped, branchErrors } = await this.resolveGuestItems(tx, payload.items, splitPolicy);

      let groupEntries = Array.from(grouped.entries());
      if (!groupEntries.length) {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
      }

      const shippingByBranch = new Map<
        string,
        {
          fee: number;
          distanceKm: number | null;
          ratePerKmCents: number | null;
          etaMinutes?: number | null;
          estimatedDeliveryTime?: string | null;
          deliveryZoneId?: string | null;
          deliveryZoneName?: string | null;
        }
      >();
      const shippingErrors = new Map<string, string>();
      for (const [branchId] of groupEntries) {
        try {
          const quote = await this.settings.computeBranchDeliveryQuote({
            branchId,
            addressLat: address.lat ?? null,
            addressLng: address.lng ?? null,
            zoneId: address.zoneId ?? null,
            subtotalCents: grouped.get(branchId)?.subtotalCents ?? 0,
          });
          shippingByBranch.set(branchId, {
            fee: quote.shippingFeeCents,
            distanceKm: distancePricingEnabled ? quote.distanceKm : null,
            ratePerKmCents: distancePricingEnabled ? quote.ratePerKmCents : null,
            etaMinutes: quote.etaMinutes ?? null,
            estimatedDeliveryTime: quote.estimatedDeliveryTime ?? null,
            deliveryZoneId: quote.deliveryZoneId ?? null,
            deliveryZoneName: quote.deliveryZoneName ?? null,
          });
        } catch (error: any) {
          shippingErrors.set(branchId, error?.message ?? 'Delivery unavailable');
        }
      }

      if (shippingErrors.size > 0) {
        if (splitPolicy === OrderSplitFailurePolicy.CANCEL_GROUP) {
          const message = Array.from(shippingErrors.values())[0] ?? 'Delivery unavailable';
          throw new DomainError(ErrorCode.VALIDATION_FAILED, message);
        }
        for (const [branchId, message] of shippingErrors.entries()) {
          branchErrors.set(branchId, message);
        }
        groupEntries = groupEntries.filter(([branchId]) => !shippingErrors.has(branchId));
      }

      if (!groupEntries.length) {
        throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
      }

      const providerIds = new Set(groupEntries.map(([, group]) => group.providerId));
      if (providerIds.size > 1) {
        throw new DomainError(ErrorCode.CART_PROVIDER_MISMATCH, 'Cart contains items from multiple providers');
      }
      if (groupEntries.length > 1) {
        throw new DomainError(ErrorCode.CART_BRANCH_MISMATCH, 'Cart contains items from multiple branches');
      }

      if (payload.deliveryWindowId || payload.scheduledAt) {
        await this.resolveDeliveryWindowSelection({
          branch: groupEntries[0][1].branch,
          subtotalCents: groupEntries[0][1].subtotalCents,
          deliveryWindowId: payload.deliveryWindowId,
          scheduledAt: payload.scheduledAt,
        });
      }

      const groups = groupEntries.map(([branchId, group]) => {
        const shipping = shippingByBranch.get(branchId);
        const deliveryMode =
          group.branch.deliveryMode ??
          group.branch.provider?.deliveryMode ??
          DeliveryMode.PLATFORM;
        return {
          branchId,
          providerId: group.providerId,
          branchName: (group.branch as any).name ?? null,
          branchNameAr: (group.branch as any).nameAr ?? null,
          subtotalCents: group.subtotalCents,
          shippingFeeCents: shipping?.fee ?? 0,
          distanceKm: shipping?.distanceKm ?? null,
          ratePerKmCents: shipping?.ratePerKmCents ?? null,
          deliveryMode,
          deliveryRequiresLocation: false,
          deliveryUnavailable: false,
        };
      });

      const subtotalCents = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
      let shippingFeeCents = groups.reduce((sum, group) => sum + group.shippingFeeCents, 0);
      if (groups.length > 1) {
        let maxFee = 0;
        let maxIndex = -1;
        groups.forEach((group, index) => {
          if (group.shippingFeeCents > maxFee) {
            maxFee = group.shippingFeeCents;
            maxIndex = index;
          }
        });
        groups.forEach((group, index) => {
          if (index !== maxIndex) {
            group.shippingFeeCents = 0;
          }
        });
        shippingFeeCents = maxFee;
      }
      const serviceFeeCents = groups.length > 0 ? groups.length * this.serviceFeeCents : 0;
      const totalCents = Math.max(subtotalCents + shippingFeeCents + serviceFeeCents, 0);

      return {
        subtotalCents,
        shippingFeeCents,
        serviceFeeCents,
        totalCents,
        groups,
        skippedBranchIds: Array.from(branchErrors.keys()),
      };
    });
  }

  async createGuestOrder(payload: CreateGuestOrderDto) {
    if (payload.deliveryTermsAccepted !== true) {
      throw new DomainError(ErrorCode.DELIVERY_TERMS_NOT_ACCEPTED, 'Delivery terms must be accepted');
    }
    const splitPolicy =
      (payload.splitFailurePolicy ?? OrderSplitFailurePolicyDto.PARTIAL) as OrderSplitFailurePolicy;
    const idempotencyKey = payload.idempotencyKey?.trim() || null;
    const guestPhone = normalizePhoneToE164(payload.phone?.trim() ?? '');
    const guestName = payload.name?.trim();
    const address = payload.address as GuestAddressInput;
    const distancePricingEnabled = this.settings.isDistancePricingEnabled();
    if (!guestName || !guestPhone) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Guest name and phone are required');
    }
    const paymentMethod = payload.paymentMethod ?? PaymentMethodDto.COD;
    await this.assertPaymentMethodEnabled(paymentMethod, { guestPhone, idempotencyKey });
    if (paymentMethod !== PaymentMethodDto.COD) {
      throw new DomainError(
        ErrorCode.PAYMENT_METHOD_INVALID,
        'Guest checkout currently supports cash on delivery only',
      );
    }
    if (
      distancePricingEnabled &&
      (!Number.isFinite(address.lat) || !Number.isFinite(address.lng))
    ) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Address location is required');
    }

    if (idempotencyKey) {
      const existingGroup = await this.prisma.orderGroup.findFirst({
        where: { idempotencyKey, userId: null, guestPhone },
        select: { id: true },
      });
      if (existingGroup) {
        return this.getGuestOrderGroupSummary(existingGroup.id);
      }
    }

    const automationEvents: AutomationEventRef[] = [];

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const { grouped, branchErrors, branchProductMap, productMap } = await this.resolveGuestItems(
          tx,
          payload.items,
          splitPolicy,
        );

        let groupEntries = Array.from(grouped.entries());
        if (!groupEntries.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
        }

        const shippingByBranch = new Map<
          string,
          {
            fee: number;
            distanceKm: number | null;
            ratePerKmCents: number | null;
            etaMinutes?: number | null;
            estimatedDeliveryTime?: string | null;
            deliveryZoneId?: string | null;
            deliveryZoneName?: string | null;
          }
        >();
        const shippingErrors = new Map<string, string>();
        for (const [branchId] of groupEntries) {
          try {
            const quote = await this.settings.computeBranchDeliveryQuote({
              branchId,
              addressLat: address.lat ?? null,
              addressLng: address.lng ?? null,
              zoneId: address.zoneId ?? null,
              subtotalCents: grouped.get(branchId)?.subtotalCents ?? 0,
            });
            shippingByBranch.set(branchId, {
              fee: quote.shippingFeeCents,
              distanceKm: distancePricingEnabled ? quote.distanceKm : null,
              ratePerKmCents: distancePricingEnabled ? quote.ratePerKmCents : null,
              etaMinutes: quote.etaMinutes ?? null,
              estimatedDeliveryTime: quote.estimatedDeliveryTime ?? null,
              deliveryZoneId: quote.deliveryZoneId ?? null,
              deliveryZoneName: quote.deliveryZoneName ?? null,
            });
          } catch (error: any) {
            shippingErrors.set(branchId, error?.message ?? 'Delivery unavailable');
          }
        }

        if (shippingErrors.size > 0) {
          if (splitPolicy === OrderSplitFailurePolicy.CANCEL_GROUP) {
            const message = Array.from(shippingErrors.values())[0] ?? 'Delivery unavailable';
            throw new DomainError(ErrorCode.VALIDATION_FAILED, message);
          }
          for (const [branchId, message] of shippingErrors.entries()) {
            branchErrors.set(branchId, message);
          }
          groupEntries = groupEntries.filter(([branchId]) => !shippingErrors.has(branchId));
        }

        if (!groupEntries.length) {
          throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
        }

        const providerIds = new Set(groupEntries.map(([, group]) => group.providerId));
        if (providerIds.size > 1) {
          throw new DomainError(ErrorCode.CART_PROVIDER_MISMATCH, 'Cart contains items from multiple providers');
        }
        if (groupEntries.length > 1) {
          throw new DomainError(ErrorCode.CART_BRANCH_MISMATCH, 'Cart contains items from multiple branches');
        }

        const scheduling = await this.resolveDeliveryWindowSelection({
          branch: groupEntries[0][1].branch,
          subtotalCents: groupEntries[0][1].subtotalCents,
          deliveryWindowId: payload.deliveryWindowId,
          scheduledAt: payload.scheduledAt,
        });

        const subtotalCentsTotal = groupEntries.reduce(
          (sum, [, group]) => sum + group.subtotalCents,
          0,
        );
        const branchIds = groupEntries.map(([branchId]) => branchId);
        const { totalFeeCents: shippingFeeCentsTotal, primaryBranchId } = this.resolveCombinedShippingFee(
          branchIds,
          shippingByBranch,
        );
        const serviceFeeCentsTotal = this.calculateServiceFeeCents(groupEntries.length);

        const guestAddress = this.buildGuestAddress(address);
        const orderGroup = await tx.orderGroup.create({
          data: {
            userId: null,
            idempotencyKey,
            addressId: null,
            guestName,
            guestPhone,
            guestAddress,
            guestLat: address.lat ?? null,
            guestLng: address.lng ?? null,
            status: 'PENDING',
            splitFailurePolicy: splitPolicy,
            paymentMethod: paymentMethod as PaymentMethod,
            deliveryTermsAccepted: true,
            deliveryWindowId: scheduling.deliveryWindowId ?? null,
            scheduledAt: scheduling.scheduledAt ?? null,
            subtotalCents: subtotalCentsTotal,
            shippingFeeCents: shippingFeeCentsTotal,
            serviceFeeCents: serviceFeeCentsTotal,
            discountCents: 0,
            totalCents: subtotalCentsTotal + shippingFeeCentsTotal + serviceFeeCentsTotal,
          },
        });

        const createdOrders: { id: string }[] = [];
        for (const [branchId, group] of groupEntries) {
          const shippingQuote = shippingByBranch.get(branchId);
          const deliveryMode =
            group.branch.deliveryMode ??
            group.branch.provider?.deliveryMode ??
            DeliveryMode.PLATFORM;
          const deliveryDistanceKm = distancePricingEnabled ? shippingQuote?.distanceKm ?? null : null;
          const deliveryRatePerKmCents = distancePricingEnabled ? shippingQuote?.ratePerKmCents ?? null : null;
          const shippingFeeCents =
            groupEntries.length > 1 ? (branchId === primaryBranchId ? shippingFeeCentsTotal : 0) : shippingQuote?.fee ?? 0;
          const deliveryEtaMinutes = shippingQuote?.etaMinutes ?? null;
          const estimatedDeliveryTime = shippingQuote?.estimatedDeliveryTime ?? null;
          const totalCents = group.subtotalCents + shippingFeeCents + this.serviceFeeCents;

          const code = await this.generateOrderCode(tx);
          const order = await tx.order.create({
            data: {
              userId: null,
              code,
              status: OrderStatus.PENDING,
              paymentMethod: paymentMethod as PaymentMethod,
              deliveryTermsAccepted: true,
              deliveryWindowId: scheduling.deliveryWindowId ?? null,
              scheduledAt: scheduling.scheduledAt ?? null,
              subtotalCents: group.subtotalCents,
              shippingFeeCents,
              serviceFeeCents: this.serviceFeeCents,
              discountCents: 0,
              totalCents,
              loyaltyDiscountCents: 0,
              loyaltyPointsUsed: 0,
              addressId: null,
              cartId: null,
              notes: payload.note,
              couponCode: null,
              orderGroupId: orderGroup.id,
              providerId: group.providerId,
              branchId,
              deliveryMode,
              deliveryDistanceKm,
              deliveryRatePerKmCents,
              deliveryEtaMinutes,
              estimatedDeliveryTime,
              guestName,
              guestPhone,
              guestAddress,
              guestLat: address.lat ?? null,
              guestLng: address.lng ?? null,
              items: {
                create: group.items.map((item) => {
                  const optionCreates = item.options.map((option) => ({
                    optionId: option.optionId,
                    optionNameSnapshot: option.name,
                    optionNameArSnapshot: option.nameAr ?? null,
                    priceSnapshotCents: option.priceCents,
                    qty: option.qty,
                  }));
                  return {
                    productId: item.productId,
                    productNameSnapshot: item.productName,
                    priceSnapshotCents: item.priceCents,
                    unitPriceCents: item.priceCents,
                    unitCostCents: item.costCents ?? 0,
                    lineTotalCents: item.priceCents * item.qty,
                    lineProfitCents: (item.priceCents - (item.costCents ?? 0)) * item.qty,
                    qty: item.qty,
                    options: optionCreates.length ? { create: optionCreates } : undefined,
                  };
                }),
              },
            },
            select: { id: true },
          });
          createdOrders.push(order);

          for (const item of group.items) {
            const branchProduct = branchProductMap.get(`${branchId}:${item.productId}`);
            let updatedProductStock = false;
            if (branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
              const updated = await tx.branchProduct.updateMany({
                where: {
                  branchId,
                  productId: item.productId,
                  isActive: true,
                  stock: { gte: item.qty },
                },
                data: { stock: { decrement: item.qty } },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ErrorCode.CART_PRODUCT_UNAVAILABLE,
                  `Insufficient stock for ${item.productName}`,
                );
              }
            } else {
              const updated = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  status: ProductStatus.ACTIVE,
                  deletedAt: null,
                  stock: { gte: item.qty },
                },
                data: { stock: { decrement: item.qty } },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ErrorCode.CART_PRODUCT_UNAVAILABLE,
                  `Insufficient stock for ${item.productName}`,
                );
              }
              updatedProductStock = true;
            }

            const product = productMap.get(item.productId);
            if (product && updatedProductStock) {
              const previousStock = product.stock ?? 0;
              const newStock = previousStock - item.qty;
              await tx.productStockLog.create({
                data: {
                  productId: item.productId,
                  previousStock,
                  newStock,
                  delta: newStock - previousStock,
                  reason: 'order.checkout',
                  actorId: guestPhone ?? undefined,
                },
              });
              product.stock = newStock;
            }
          }

            const eventPayload = await this.buildOrderEventPayload(order.id, tx);
          const createdEvent = await this.automation.emit('order.created', eventPayload, {
            tx,
            dedupeKey: `order:${order.id}:${OrderStatus.PENDING}:created`,
          });
          automationEvents.push(createdEvent);
        }

        return {
          orderGroupId: orderGroup.id,
          orderIds: createdOrders.map((order) => order.id),
          skippedBranchIds: Array.from(branchErrors.keys()),
        };
      });

        await this.automation.enqueueMany(automationEvents);
        for (const orderId of result.orderIds) {
          await this.clearCachesForOrder(orderId, null);
          await this.notifyOrderCreatedWhatsapp(orderId);
        }
      if (result.orderIds.length === 1) {
        return this.getGuestOrderDetail(result.orderIds[0]);
      }
      const summary = await this.getGuestOrderGroupSummary(result.orderGroupId);
      return {
        ...summary,
        skippedBranchIds: result.skippedBranchIds,
      };
    } catch (error) {
      const err = error as Error;
      const errorCode = error instanceof DomainError ? error.code : (error as any)?.code;
      this.logger.error(
        {
          msg: 'Guest checkout failed',
          guestPhone,
          idempotencyKey,
          paymentMethod,
          errorCode,
          errorMessage: err?.message,
        },
        err?.stack,
      );
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingGroup = await this.prisma.orderGroup.findFirst({
          where: { idempotencyKey, userId: null, guestPhone },
          select: { id: true },
        });
        if (existingGroup) {
          return this.getGuestOrderGroupSummary(existingGroup.id);
        }
      }
      throw error;
    }
  }

  async requestGuestTrackingOtp(phone: string, ip?: string) {
    const normalized = normalizePhoneToE164(phone);
    return this.otp.requestOtp(normalized, 'ORDER_TRACKING', ip);
  }

  async trackGuestOrdersWithOtp(
    phone: string,
    otp: string,
    otpId?: string,
    code?: string,
    ip?: string,
  ) {
    const normalized = normalizePhoneToE164(phone);
    if (otpId) {
      await this.otp.verifyOtp(normalized, 'ORDER_TRACKING', otpId, otp, ip);
    } else {
      await this.otp.verifyOtpLegacy(normalized, 'ORDER_TRACKING', otp, ip);
    }
    return this.trackGuestOrders(normalized, code);
  }

  async trackGuestOrders(phone: string, code?: string) {
    const cleanPhone = phone?.trim();
    if (!cleanPhone) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Phone number is required');
    }
    const normalizedPhone = normalizePhoneToE164(cleanPhone);
    const phoneCandidates = Array.from(new Set([cleanPhone, normalizedPhone]));
    const where: Prisma.OrderGroupWhereInput = {
      guestPhone: { in: phoneCandidates },
      userId: null,
    };
    if (code) {
      where.OR = [
        { code: { equals: code } },
        { orders: { some: { code: { equals: code } } } },
      ];
    }
    const group = await this.prisma.orderGroup.findFirst({
      where,
      include: {
        orders: {
          select: {
            id: true,
            code: true,
            status: true,
            totalCents: true,
            subtotalCents: true,
            shippingFeeCents: true,
            serviceFeeCents: true,
            discountCents: true,
            providerId: true,
            branchId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    return {
      orderGroupId: group.id,
      code: group.code,
      status: group.status,
      subtotalCents: group.subtotalCents,
      shippingFeeCents: group.shippingFeeCents,
      serviceFeeCents:
        group.serviceFeeCents ??
        this.inferServiceFeeCents({
          subtotalCents: group.subtotalCents,
          shippingFeeCents: group.shippingFeeCents,
          discountCents: group.discountCents,
          totalCents: group.totalCents,
        }),
      discountCents: group.discountCents,
      totalCents: group.totalCents,
      createdAt: group.createdAt,
      orders: group.orders.map((order) => ({
        id: order.id,
        code: order.code,
        status: this.toPublicStatus(order.status),
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents,
        serviceFeeCents:
          order.serviceFeeCents ??
          this.inferServiceFeeCents({
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            discountCents: order.discountCents ?? 0,
            totalCents: order.totalCents,
          }),
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        providerId: order.providerId,
        branchId: order.branchId,
        createdAt: order.createdAt,
      })),
    };
  }

  private buildGuestAddress(address: GuestAddressInput) {
    return {
      fullAddress: address.fullAddress,
      city: address.city ?? null,
      region: address.region ?? null,
      street: address.street ?? null,
      building: address.building ?? null,
      apartment: address.apartment ?? null,
      notes: address.notes ?? null,
      zoneId: address.zoneId ?? null,
    };
  }

  private async resolveGuestItems(
    tx: Prisma.TransactionClient,
    items: GuestOrderItemInput[],
    splitPolicy: OrderSplitFailurePolicy,
  ) {
    if (!items || items.length === 0) {
      throw new DomainError(ErrorCode.CART_EMPTY, 'Cart is empty');
    }

    const uniqueProductIds = Array.from(new Set(items.map((item) => item.productId)));
    const products = await tx.product.findMany({
      where: { id: { in: uniqueProductIds }, status: ProductStatus.ACTIVE, deletedAt: null },
      select: {
        id: true,
        name: true,
        stock: true,
        priceCents: true,
        salePriceCents: true,
        costPriceCents: true,
        providerId: true,
        optionGroups: {
          where: { isActive: true },
          include: { options: { where: { isActive: true } } },
        },
      },
    });
    if (products.length !== uniqueProductIds.length) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'One or more products are unavailable');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const explicitBranchIds = Array.from(
      new Set(items.map((item) => item.branchId).filter(Boolean) as string[]),
    );
    const explicitBranches = explicitBranchIds.length
      ? await tx.branch.findMany({
          where: { id: { in: explicitBranchIds } },
          include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
        })
      : [];
    const branchById = new Map(explicitBranches.map((branch) => [branch.id, branch]));

    const providerIdsNeeded = new Set<string>();
    for (const item of items) {
      if (!item.branchId) {
        const product = productMap.get(item.productId);
        if (product) {
          providerIdsNeeded.add(product.providerId ?? this.defaultProviderId);
        }
      }
    }

    const providerBranches = providerIdsNeeded.size
      ? await tx.branch.findMany({
          where: { providerId: { in: Array.from(providerIdsNeeded) }, status: 'ACTIVE' },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
        })
      : [];
    const defaultBranchByProvider = new Map<string, (typeof providerBranches)[number]>();
    for (const branch of providerBranches) {
      if (!defaultBranchByProvider.has(branch.providerId)) {
        defaultBranchByProvider.set(branch.providerId, branch);
      }
    }

    const fallbackBranch = await tx.branch.findUnique({
      where: { id: this.defaultBranchId },
      include: { provider: { select: { id: true, deliveryMode: true, status: true } } },
    });

    const branchErrors = new Map<string, string>();
    const resolvedItems: Array<{
      product: (typeof products)[number];
      branch: (typeof explicitBranches)[number] | (typeof providerBranches)[number];
      qty: number;
      options: { optionId: string; qty: number }[];
    }> = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        branchErrors.set(item.branchId ?? 'unknown', 'Product unavailable');
        continue;
      }
      const branch =
        (item.branchId ? branchById.get(item.branchId) : undefined) ??
        defaultBranchByProvider.get(product.providerId ?? this.defaultProviderId) ??
        (fallbackBranch ?? undefined);
      if (!branch || branch.status !== 'ACTIVE') {
        branchErrors.set(item.branchId ?? branch?.id ?? 'unknown', 'Branch unavailable');
        continue;
      }
      if (branch.provider && branch.provider.status !== 'ACTIVE') {
        branchErrors.set(item.branchId ?? branch.id, 'Provider unavailable');
        continue;
      }
      if (product.providerId && branch.providerId !== product.providerId) {
        branchErrors.set(branch.id, 'Branch does not match product provider');
        continue;
      }
      resolvedItems.push({
        product,
        branch,
        qty: item.qty,
        options: this.normalizeOptionInputs(item.options ?? []),
      });
    }

    const branchPairs = resolvedItems.map((item) => ({
      branchId: item.branch.id,
      productId: item.product.id,
    }));
    const branchProducts = branchPairs.length
      ? await tx.branchProduct.findMany({
          where: { OR: branchPairs },
        })
      : [];
    const branchProductMap = new Map(
      branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
    );

    const validItems: Array<{
      branchId: string;
      providerId: string;
      productId: string;
      productName: string;
      qty: number;
      priceCents: number;
      costCents: number;
      options: Array<{ optionId: string; name: string; nameAr: string | null; priceCents: number; qty: number }>;
      branch: (typeof resolvedItems)[number]['branch'];
    }> = [];

    for (const item of resolvedItems) {
      const branchProduct = branchProductMap.get(`${item.branch.id}:${item.product.id}`);
      if (!branchProduct || !branchProduct.isActive) {
        branchErrors.set(item.branch.id, 'Product unavailable in this branch');
        continue;
      }
      const stock = this.resolveEffectiveStock(item.product.stock, branchProduct.stock);
      if (stock <= 0) {
        branchErrors.set(item.branch.id, `Out of stock: ${item.product.name}`);
        continue;
      }
      if (stock < item.qty) {
        branchErrors.set(item.branch.id, `Insufficient stock for ${item.product.name}`);
        continue;
      }
      if (!item.product.costPriceCents || item.product.costPriceCents <= 0) {
        this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: item.product.id });
      }
      const basePrice =
        branchProduct.salePriceCents ??
        branchProduct.priceCents ??
        item.product.salePriceCents ??
        item.product.priceCents;
      let optionSelection: {
        optionsTotalCents: number;
        options: Array<{ optionId: string; name: string; nameAr: string | null; priceCents: number; qty: number }>;
      };
      try {
        optionSelection = this.resolveOptionSelectionsFromProduct(item.product, item.options);
      } catch (error: any) {
        branchErrors.set(item.branch.id, error?.userMessage ?? error?.message ?? 'Invalid product options');
        continue;
      }
      const priceCents = basePrice + optionSelection.optionsTotalCents;
      validItems.push({
        branchId: item.branch.id,
        providerId: item.branch.providerId,
        productId: item.product.id,
        productName: item.product.name,
        qty: item.qty,
        priceCents,
        costCents: item.product.costPriceCents ?? 0,
        options: optionSelection.options,
        branch: item.branch,
      });
    }

    if (branchErrors.size > 0 && splitPolicy === OrderSplitFailurePolicy.CANCEL_GROUP) {
      const message = Array.from(branchErrors.values())[0] ?? 'Some items are unavailable';
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, message);
    }

    const filteredItems = validItems.filter((item) => !branchErrors.has(item.branchId));
    if (!filteredItems.length) {
      throw new DomainError(ErrorCode.CART_PRODUCT_UNAVAILABLE, 'No items available to order');
    }

    const grouped = new Map<
      string,
      {
        branch: (typeof filteredItems)[number]['branch'];
        providerId: string;
        items: typeof filteredItems;
        subtotalCents: number;
      }
    >();
    for (const item of filteredItems) {
      const existing = grouped.get(item.branchId);
      if (!existing) {
        grouped.set(item.branchId, {
          branch: item.branch,
          providerId: item.providerId,
          items: [item],
          subtotalCents: item.priceCents * item.qty,
        });
      } else {
        existing.items.push(item);
        existing.subtotalCents += item.priceCents * item.qty;
      }
    }

    return { grouped, branchErrors, branchProductMap, productMap };
  }

  private async getGuestOrderDetail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        address: true,
        driver: { select: { id: true, fullName: true, phone: true } },
        items: {
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            priceSnapshotCents: true,
            qty: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const zone = order.deliveryZoneId
      ? await this.settings.getZoneById(order.deliveryZoneId, { includeInactive: true })
      : undefined;
    return this.toOrderDetail(order, zone);
  }

  private async getGuestOrderGroupSummary(orderGroupId: string) {
    const group = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId: null },
      include: {
        orders: {
          select: {
            id: true,
            code: true,
            status: true,
            totalCents: true,
            subtotalCents: true,
            shippingFeeCents: true,
            serviceFeeCents: true,
            discountCents: true,
            providerId: true,
            branchId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order group not found', 404);
    }
    const serviceFeeCents =
      group.serviceFeeCents ??
      this.inferServiceFeeCents({
        subtotalCents: group.subtotalCents,
        shippingFeeCents: group.shippingFeeCents,
        discountCents: group.discountCents,
        totalCents: group.totalCents,
      });
    return {
      orderGroupId: group.id,
      code: group.code,
      status: group.status,
      subtotalCents: group.subtotalCents,
      shippingFeeCents: group.shippingFeeCents,
      serviceFeeCents,
      discountCents: group.discountCents,
      totalCents: group.totalCents,
      createdAt: group.createdAt,
      orders: group.orders.map((order) => ({
        id: order.id,
        code: order.code,
        status: this.toPublicStatus(order.status),
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents,
        serviceFeeCents:
          order.serviceFeeCents ??
          this.inferServiceFeeCents({
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            discountCents: order.discountCents ?? 0,
            totalCents: order.totalCents,
          }),
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        providerId: order.providerId,
        branchId: order.branchId,
        createdAt: order.createdAt,
      })),
    };
  }

  async awardLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const config = await this.settings.getLoyaltyConfig();
    if (!config.enabled || config.earnRate <= 0) {
      return 0;
    }

    const runner = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true, subtotalCents: true, loyaltyPointsEarned: true },
      });
      if (!order) return 0;
      if (!order.userId) return 0;
      if (order.status !== OrderStatus.DELIVERED) return 0;

      const existingTxn = await client.loyaltyTransaction.findFirst({
        where: { orderId, type: 'EARN' },
      });
      if (existingTxn) {
        if ((order.loyaltyPointsEarned ?? 0) === 0 && existingTxn.points > 0) {
          await client.order.update({
            where: { id: orderId },
            data: { loyaltyPointsEarned: existingTxn.points },
          });
        }
        return existingTxn.points ?? 0;
      }

      if ((order.loyaltyPointsEarned ?? 0) > 0) {
        return order.loyaltyPointsEarned ?? 0;
      }

      const earned = await this.loyalty.awardPoints({
        userId: order.userId,
        subtotalCents: order.subtotalCents,
        tx: client,
        orderId: order.id,
      });
      if (earned > 0) {
        await client.order.update({
          where: { id: order.id },
          data: { loyaltyPointsEarned: earned },
        });
      }
      return earned;
    };

    if (tx) {
      return runner(tx);
    }
    return this.prisma.$transaction(runner);
  }

  async revokeLoyaltyForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const runner = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, loyaltyPointsEarned: true },
      });
      if (!order || !order.loyaltyPointsEarned || order.loyaltyPointsEarned <= 0) {
        return 0;
      }
      if (!order.userId) {
        return 0;
      }

      const existingAdjustment = await client.loyaltyTransaction.findFirst({
        where: {
          orderId,
          type: 'ADJUST',
          metadata: { path: ['reason'], equals: 'order.cancel' },
        },
      });
      if (existingAdjustment) {
        return Math.abs(existingAdjustment.points ?? 0);
      }

      const user = await client.user.findUnique({
        where: { id: order.userId },
        select: { loyaltyPoints: true },
      });
      if (!user) return 0;

      const adjustment = Math.min(order.loyaltyPointsEarned, user.loyaltyPoints);
      const nextBalance = Math.max(0, user.loyaltyPoints - adjustment);

      await client.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: nextBalance },
      });
      await client.loyaltyTransaction.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: 'ADJUST',
          points: -adjustment,
          metadata: { reason: 'order.cancel' },
        },
      });
      return adjustment;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async assignDriverToOrder(orderId: string, driverId: string, actorId?: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true, driverId: true },
      });
      if (!order) {
        throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
      }
      if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELED) {
        throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
      }
      const assignableStatuses: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PREPARING];
      if (!assignableStatuses.includes(order.status)) {
        throw new DomainError(
          ErrorCode.ORDER_ASSIGNMENT_NOT_ALLOWED,
          'Driver assignment is only allowed for confirmed or preparing orders',
        );
      }

      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          isActive: true,
          vehicle: { select: { type: true, plateNumber: true } },
        },
      });
      if (!driver) {
        throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
      }
      if (!driver.isActive) {
        throw new DomainError(ErrorCode.DRIVER_INACTIVE, 'Driver is inactive');
      }

      const automationEvents: AutomationEventRef[] = [];
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.order.update({
          where: { id: orderId },
          data: { driverId: driver.id, driverAssignedAt: new Date() },
          select: {
            id: true,
            userId: true,
            driverAssignedAt: true,
            driver: {
              select: { id: true, fullName: true, phone: true, vehicle: { select: { type: true, plateNumber: true } } },
            },
          },
        });

        const payload = await this.buildOrderEventPayload(orderId, tx);
        const event = await this.automation.emit('order.driver_assigned', payload, {
          tx,
          dedupeKey: `order:${orderId}:driver:${driver.id}`,
        });
        automationEvents.push(event);
        return next;
      });

      await this.audit.log({
        action: 'order.assign-driver',
        entity: 'order',
        entityId: orderId,
        actorId,
        before: { driverId: order.driverId ?? null },
        after: { driverId: driver.id },
      });
      this.logger.log({ msg: 'Driver assigned to order', orderId, driverId: driver.id, actorId });

      await this.automation.enqueueMany(automationEvents);
      await this.clearCachesForOrder(orderId, updated.userId);

      return {
        orderId: updated.id,
        driverAssignedAt: updated.driverAssignedAt,
        driver: {
          id: updated.driver?.id ?? driver.id,
          fullName: updated.driver?.fullName ?? driver.fullName,
          phone: updated.driver?.phone ?? driver.phone,
          vehicleType: updated.driver?.vehicle?.type,
          plateNumber: updated.driver?.vehicle?.plateNumber,
        },
      };
    } catch (error) {
      const err = error as Error;
      const errorCode = error instanceof DomainError ? error.code : (error as any)?.code;
      this.logger.error(
        {
          msg: 'Driver assignment failed',
          orderId,
          driverId,
          actorId,
          errorCode,
          errorMessage: err?.message,
        },
        err?.stack,
      );
      throw error;
    }
  }

  async clearCachesForOrder(orderId: string, userId?: string | null) {
    const keys = [this.cache.buildKey('orders:detail', orderId, userId), this.cache.buildKey('orders:receipt', orderId)];
    if (userId) {
      keys.push(this.cache.buildKey('orders:list', userId));
    }
    await Promise.all(keys.map((key) => this.cache.del(key)));
  }

  private summarizeGroupStatus(statuses: OrderStatus[]): PublicStatus {
    if (!statuses.length) return 'PENDING';
    const active = statuses.filter((status) => status !== OrderStatus.CANCELED);
    if (!active.length) return 'CANCELED';
    if (active.some((status) => status === OrderStatus.DELIVERY_FAILED)) {
      return 'DELIVERY_FAILED';
    }
    if (active.every((status) => status === OrderStatus.DELIVERED)) {
      return 'DELIVERED';
    }
    const rank: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: 1,
      [OrderStatus.CONFIRMED]: 2,
      [OrderStatus.PREPARING]: 3,
      [OrderStatus.OUT_FOR_DELIVERY]: 4,
      [OrderStatus.DELIVERY_FAILED]: 5,
      [OrderStatus.DELIVERED]: 6,
      [OrderStatus.CANCELED]: 0,
    };
    const top = active.reduce((best, status) => (rank[status] > rank[best] ? status : best), active[0]);
    return this.toPublicStatus(top);
  }

  private computeGroupTotals(
    orders: Array<{
      status: OrderStatus;
      subtotalCents: number;
      shippingFeeCents?: number | null;
      serviceFeeCents?: number | null;
      discountCents?: number | null;
      totalCents?: number | null;
      loyaltyDiscountCents?: number | null;
    }>,
  ) {
    const active = orders.filter((order) => order.status !== OrderStatus.CANCELED);
    if (!active.length) {
      return {
        subtotalCents: 0,
        shippingFeeCents: 0,
        serviceFeeCents: 0,
        discountCents: 0,
        totalCents: 0,
      };
    }
    return active.reduce(
      (acc, order) => {
        const subtotalCents = order.subtotalCents ?? 0;
        const shippingFeeCents = order.shippingFeeCents ?? 0;
        const discountCents = order.discountCents ?? 0;
        const totalCents = order.totalCents ?? 0;
        const serviceFeeCents =
          order.serviceFeeCents ??
          this.inferServiceFeeCents({
            subtotalCents,
            shippingFeeCents,
            discountCents,
            loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
            totalCents,
          });
        acc.subtotalCents += subtotalCents;
        acc.shippingFeeCents = Math.max(acc.shippingFeeCents, shippingFeeCents);
        acc.serviceFeeCents += serviceFeeCents;
        acc.discountCents += discountCents;
        acc.totalCents += totalCents;
        return acc;
      },
      {
        subtotalCents: 0,
        shippingFeeCents: 0,
        serviceFeeCents: 0,
        discountCents: 0,
        totalCents: 0,
      },
    );
  }

  private async refreshOrderGroupTotals(
    orderGroupId: string | null | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (!orderGroupId) return;
    const group = await tx.orderGroup.findUnique({
      where: { id: orderGroupId },
      include: { orders: true },
    });
    if (!group) return;

    const activeOrders = group.orders.filter((order) => order.status !== OrderStatus.CANCELED);
    if (!activeOrders.length) {
      await tx.orderGroup.update({
        where: { id: group.id },
        data: {
          subtotalCents: 0,
          shippingFeeCents: 0,
          serviceFeeCents: 0,
          discountCents: 0,
          totalCents: 0,
          status: OrderGroupStatus.CANCELED,
        },
      });
      return;
    }

    const activeHasShipping = activeOrders.some((order) => (order.shippingFeeCents ?? 0) > 0);
    if (!activeHasShipping) {
      const fallbackShippingFee = Math.max(
        group.shippingFeeCents ?? 0,
        ...group.orders.map((order) => order.shippingFeeCents ?? 0),
      );
      if (fallbackShippingFee > 0) {
        const target = activeOrders[0];
        const nextTotalCents = (target.totalCents ?? 0) + fallbackShippingFee;
        await tx.order.update({
          where: { id: target.id },
          data: { shippingFeeCents: fallbackShippingFee, totalCents: nextTotalCents },
        });
        activeOrders[0] = {
          ...target,
          shippingFeeCents: fallbackShippingFee,
          totalCents: nextTotalCents,
        };
      }
    }

    const totals = this.computeGroupTotals(activeOrders);
    await tx.orderGroup.update({
      where: { id: group.id },
      data: {
        subtotalCents: totals.subtotalCents,
        shippingFeeCents: totals.shippingFeeCents,
        serviceFeeCents: totals.serviceFeeCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
      },
    });
  }

  private async getOrderGroupSummary(userId: string, orderGroupId: string) {
    const group = await this.prisma.orderGroup.findFirst({
      where: { id: orderGroupId, userId },
      include: {
        orders: {
          select: {
            id: true,
            code: true,
            status: true,
            totalCents: true,
            subtotalCents: true,
            shippingFeeCents: true,
            serviceFeeCents: true,
            discountCents: true,
            providerId: true,
            branchId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order group not found', 404);
    }
    const serviceFeeCents =
      group.serviceFeeCents ??
      this.inferServiceFeeCents({
        subtotalCents: group.subtotalCents,
        shippingFeeCents: group.shippingFeeCents,
        discountCents: group.discountCents,
        totalCents: group.totalCents,
      });
    return {
      orderGroupId: group.id,
      code: group.code,
      status: group.status,
      subtotalCents: group.subtotalCents,
      shippingFeeCents: group.shippingFeeCents,
      serviceFeeCents,
      discountCents: group.discountCents,
      totalCents: group.totalCents,
      createdAt: group.createdAt,
      orders: group.orders.map((order) => ({
        id: order.id,
        code: order.code,
        status: this.toPublicStatus(order.status),
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents,
        serviceFeeCents:
          order.serviceFeeCents ??
          this.inferServiceFeeCents({
            subtotalCents: order.subtotalCents,
            shippingFeeCents: order.shippingFeeCents ?? 0,
            discountCents: order.discountCents ?? 0,
            totalCents: order.totalCents,
          }),
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        providerId: order.providerId,
        branchId: order.branchId,
        createdAt: order.createdAt,
      })),
    };
  }

  private async generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    let attempts = 0;
    while (attempts < 5) {
      const code = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists = await tx.order.findUnique({ where: { code } });
      if (!exists) {
        return code;
      }
      attempts += 1;
    }
    return `ORD-${Date.now().toString(36).toUpperCase()}`;
  }

  private allocateDiscounts(
    totalDiscountCents: number,
    groups: Array<[string, { subtotalCents: number }]>,
  ) {
    const allocations = new Map<string, number>();
    if (totalDiscountCents <= 0 || groups.length === 0) {
      for (const [branchId] of groups) allocations.set(branchId, 0);
      return allocations;
    }
    const totalSubtotal = groups.reduce((sum, [, group]) => sum + group.subtotalCents, 0) || 1;
    let remaining = totalDiscountCents;
    groups.forEach(([branchId, group], index) => {
      if (index === groups.length - 1) {
        allocations.set(branchId, remaining);
        return;
      }
      const share = Math.floor((totalDiscountCents * group.subtotalCents) / totalSubtotal);
      allocations.set(branchId, share);
      remaining -= share;
    });
    return allocations;
  }

  private calculateServiceFeeCents(groupCount: number) {
    return groupCount > 0 ? groupCount * this.serviceFeeCents : 0;
  }

  private resolveEffectiveStock(productStock?: number | null, branchStock?: number | null) {
    const productValue = productStock ?? null;
    const branchValue = branchStock ?? null;
    if (productValue === null && branchValue === null) return 0;
    if (productValue === null) return branchValue ?? 0;
    if (branchValue === null) return productValue ?? 0;
    return Math.min(productValue, branchValue);
  }

  private normalizeOptionInputs(options?: { optionId: string; qty?: number }[]) {
    if (!options || options.length === 0) return [];
    const map = new Map<string, number>();
    for (const entry of options) {
      const optionId = String(entry.optionId ?? '').trim();
      if (!optionId) continue;
      const rawQty = entry.qty ?? 1;
      const qty = Math.floor(Number(rawQty));
      if (!Number.isFinite(qty) || qty < 1) continue;
      map.set(optionId, (map.get(optionId) ?? 0) + qty);
    }
    return Array.from(map.entries())
      .map(([optionId, qty]) => ({ optionId, qty }))
      .sort((a, b) => a.optionId.localeCompare(b.optionId));
  }

  private resolveOptionSelectionsFromProduct(
    product: {
      id: string;
      name: string;
      optionGroups?: Array<{
        id: string;
        type: ProductOptionGroupType;
        minSelected: number;
        maxSelected: number | null;
        isActive: boolean;
        options: Array<{
          id: string;
          name: string;
          nameAr: string | null;
          priceCents: number;
          maxQtyPerOption: number | null;
          isActive: boolean;
        }>;
      }>;
    },
    selections: { optionId: string; qty: number }[],
  ) {
    const groups = product.optionGroups ?? [];
    if (!groups.length && selections.length > 0) {
      throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Options are not available for this product');
    }

    const optionMap = new Map<
      string,
      {
        option: { id: string; name: string; nameAr: string | null; priceCents: number; maxQtyPerOption: number | null };
        group: { id: string; type: ProductOptionGroupType; minSelected: number; maxSelected: number | null };
      }
    >();
    for (const group of groups) {
      if (!group.isActive) continue;
      for (const option of group.options) {
        if (!option.isActive) continue;
        optionMap.set(option.id, { option, group });
      }
    }

    const selectedCounts = new Map<string, number>();
    let optionsTotalCents = 0;
    const resolvedOptions: Array<{
      optionId: string;
      name: string;
      nameAr: string | null;
      priceCents: number;
      qty: number;
    }> = [];
    for (const selection of selections) {
      const entry = optionMap.get(selection.optionId);
      if (!entry) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Invalid product option selected');
      }
      if (entry.option.maxQtyPerOption && selection.qty > entry.option.maxQtyPerOption) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Option quantity exceeds limit');
      }
      optionsTotalCents += entry.option.priceCents * selection.qty;
      resolvedOptions.push({
        optionId: entry.option.id,
        name: entry.option.name,
        nameAr: entry.option.nameAr ?? null,
        priceCents: entry.option.priceCents,
        qty: selection.qty,
      });
      selectedCounts.set(entry.group.id, (selectedCounts.get(entry.group.id) ?? 0) + 1);
    }

    for (const group of groups) {
      if (!group.isActive) continue;
      const selected = selectedCounts.get(group.id) ?? 0;
      const minSelected = group.minSelected ?? 0;
      const maxSelected = group.maxSelected ?? (group.type === ProductOptionGroupType.SINGLE ? 1 : null);
      if (selected < minSelected) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Required options are missing');
      }
      if (maxSelected !== null && maxSelected !== undefined && selected > maxSelected) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Too many options selected');
      }
      if (group.type === ProductOptionGroupType.SINGLE && selected > 1) {
        throw new DomainError(ErrorCode.CART_OPTIONS_INVALID, 'Only one option can be selected');
      }
    }

    resolvedOptions.sort((a, b) => a.optionId.localeCompare(b.optionId));
    return { optionsTotalCents, options: resolvedOptions };
  }

  private resolveCombinedShippingFee(
    branchIds: string[],
    shippingByBranch: Map<string, { fee: number }>,
  ) {
    let sum = 0;
    let maxFee = 0;
    let primaryBranchId: string | null = null;
    for (const branchId of branchIds) {
      const fee = shippingByBranch.get(branchId)?.fee ?? 0;
      sum += fee;
      if (fee > maxFee || primaryBranchId === null) {
        maxFee = fee;
        primaryBranchId = branchId;
      }
    }
    if (branchIds.length > 1) {
      return { totalFeeCents: maxFee, primaryBranchId };
    }
    return { totalFeeCents: sum, primaryBranchId };
  }

  private async resolveDeliveryWindowSelection(params: {
    branch: { id: string; providerId: string; schedulingEnabled?: boolean | null; schedulingAllowAsap?: boolean | null };
    subtotalCents: number;
    deliveryWindowId?: string | null;
    scheduledAt?: string | null;
  }) {
    const schedulingEnabled = params.branch.schedulingEnabled === true;
    const allowAsap = params.branch.schedulingAllowAsap !== false;
    const windowId = params.deliveryWindowId ?? null;
    const scheduledAtRaw = params.scheduledAt ?? null;

    if (!schedulingEnabled) {
      return { deliveryWindowId: null, scheduledAt: null };
    }

    if (!windowId) {
      if (scheduledAtRaw) {
        throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window is required for scheduled orders');
      }
      if (allowAsap) {
        return { deliveryWindowId: null, scheduledAt: null };
      }
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_REQUIRED, 'Delivery window is required');
    }

    if (!scheduledAtRaw) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_REQUIRED, 'Scheduled time is required');
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (!Number.isFinite(scheduledAt.getTime())) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Invalid scheduled time');
    }

    const window = await this.prisma.deliveryWindow.findFirst({
      where: { id: windowId, isActive: true },
    });
    if (!window) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window is not available');
    }
    if (window.providerId !== params.branch.providerId) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window does not match provider');
    }
    if (window.branchId && window.branchId !== params.branch.id) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window does not match branch');
    }

    const day = scheduledAt.getDay();
    if (Array.isArray(window.daysOfWeek) && window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(day)) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window is not available on this day');
    }
    const minutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
    if (window.startMinutes >= window.endMinutes) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Delivery window configuration is invalid');
    }
    if (minutes < window.startMinutes || minutes >= window.endMinutes) {
      throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Scheduled time is outside the delivery window');
    }

    const minLeadMinutes = window.minLeadMinutes ?? 0;
    if (minLeadMinutes > 0) {
      const earliest = Date.now() + minLeadMinutes * 60 * 1000;
      if (scheduledAt.getTime() < earliest) {
        throw new DomainError(ErrorCode.DELIVERY_WINDOW_INVALID, 'Scheduled time is too soon');
      }
    }

    if (window.minOrderAmountCents && params.subtotalCents < window.minOrderAmountCents) {
      throw new DomainError(
        ErrorCode.DELIVERY_WINDOW_INVALID,
        'Order does not meet the minimum required for scheduled delivery',
      );
    }

    return { deliveryWindowId: window.id, scheduledAt };
  }

  private inferServiceFeeCents(params: {
    subtotalCents: number;
    shippingFeeCents: number;
    discountCents: number;
    loyaltyDiscountCents?: number | null;
    totalCents: number;
  }) {
    const base =
      params.subtotalCents +
      params.shippingFeeCents -
      params.discountCents -
      (params.loyaltyDiscountCents ?? 0);
    return Math.max(params.totalCents - base, 0);
  }

  async reorder(userId: string, fromOrderId: string) {
    const source = await this.prisma.order.findFirst({
      where: { id: fromOrderId, userId },
      include: {
        items: { include: { options: true } },
        address: true,
      },
    });
    if (!source) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (!source.items.length) {
      throw new DomainError(ErrorCode.CART_EMPTY, 'Order has no items to reorder');
    }

    const automationEvents: AutomationEventRef[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const productIds = Array.from(new Set(source.items.map((i) => i.productId)));
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: ProductStatus.ACTIVE, deletedAt: null },
        select: {
          id: true,
          name: true,
          stock: true,
          priceCents: true,
          salePriceCents: true,
          costPriceCents: true,
          optionGroups: {
            where: { isActive: true },
            include: { options: { where: { isActive: true } } },
          },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const branchId = source.branchId ?? undefined;
      const branchProducts = branchId
        ? await tx.branchProduct.findMany({
            where: { branchId, productId: { in: productIds } },
          })
        : [];
      const branchProductMap = new Map(
        branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
      );

      const orderItems = source.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product unavailable: ${item.productNameSnapshot || item.productId}`,
          );
        }
        const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
        if (branchId && (!branchProduct || !branchProduct.isActive)) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product unavailable: ${item.productNameSnapshot || item.productId}`,
          );
        }
        const availableStock = this.resolveEffectiveStock(product.stock, branchProduct?.stock);
        if (availableStock <= 0) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Product out of stock: ${product.name}`,
          );
        }
        if (availableStock < item.qty) {
          throw new DomainError(
            ErrorCode.CART_PRODUCT_UNAVAILABLE,
            `Insufficient stock for ${product.name}`,
          );
        }
        const basePrice =
          branchProduct?.salePriceCents ??
          branchProduct?.priceCents ??
          product.salePriceCents ??
          product.priceCents;
        const optionSelection = this.resolveOptionSelectionsFromProduct(
          product,
          this.normalizeOptionInputs(
            item.options?.map((option) => ({
              optionId: option.optionId ?? '',
              qty: option.qty,
            })) ?? [],
          ),
        );
        const priceCents = basePrice + optionSelection.optionsTotalCents;
        const costCents = product.costPriceCents ?? 0;
        if (!costCents || costCents <= 0) {
          this.logger.warn({ msg: 'Missing cost price snapshot for product', productId: product.id });
        }
        return {
          productId: product.id,
          productName: product.name,
          qty: item.qty,
          priceCents,
          costCents,
          options: optionSelection.options,
        };
      });

      for (const item of orderItems) {
        const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
        let updatedProductStock = false;
        if (branchId && branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
          await tx.branchProduct.updateMany({
            where: {
              branchId,
              productId: item.productId,
              isActive: true,
              stock: { gte: item.qty },
            },
            data: { stock: { decrement: item.qty } },
          });
        } else {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              status: ProductStatus.ACTIVE,
              deletedAt: null,
              stock: { gte: item.qty },
            },
            data: { stock: { decrement: item.qty } },
          });
          updatedProductStock = true;
        }
        if (updatedProductStock) {
          const product = productMap.get(item.productId)!;
          const previousStock = product.stock ?? 0;
          const newStock = previousStock - item.qty;
          productMap.set(item.productId, newStock as any);
          await tx.productStockLog.create({
            data: {
              productId: item.productId,
              previousStock,
              newStock,
              delta: newStock - previousStock,
              reason: 'order.reorder',
              actorId: userId,
            },
          });
        }
      }

      const subtotalCents = orderItems.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      const address =
        source.address && source.address.userId === userId
          ? source.address
          : await tx.address.findFirst({
              where: { userId },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
            });
      if (!address) {
        throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'No address available for reorder');
      }

      let shippingFeeCents = 0;
      let deliveryDistanceKm: number | null = null;
      let deliveryRatePerKmCents: number | null = null;
      let deliveryEtaMinutes: number | null = null;
      let estimatedDeliveryTime: string | null = null;
      const deliveryMode = source.deliveryMode ?? DeliveryMode.PLATFORM;
      const distancePricingEnabled = this.settings.isDistancePricingEnabled();
      const hasLocation = address.lat !== null && address.lat !== undefined && address.lng !== null && address.lng !== undefined;
      if (branchId && (!distancePricingEnabled || hasLocation)) {
        const quote = await this.settings.computeBranchDeliveryQuote({
          branchId,
          addressLat: hasLocation ? address.lat : null,
          addressLng: hasLocation ? address.lng : null,
          zoneId: address.zoneId ?? null,
          subtotalCents,
        });
        shippingFeeCents = quote.shippingFeeCents;
        deliveryDistanceKm = distancePricingEnabled ? quote.distanceKm : null;
        deliveryRatePerKmCents = distancePricingEnabled ? quote.ratePerKmCents : null;
        deliveryEtaMinutes = quote.etaMinutes ?? null;
        estimatedDeliveryTime = quote.estimatedDeliveryTime ?? null;
      } else {
        const quote = await this.settings.computeDeliveryQuote({
          subtotalCents,
          zoneId: address.zoneId,
        });
        shippingFeeCents = quote.shippingFeeCents;
        deliveryEtaMinutes = quote.etaMinutes ?? null;
        estimatedDeliveryTime = quote.estimatedDeliveryTime ?? null;
      }

      const totalCents = subtotalCents + shippingFeeCents + this.serviceFeeCents;
      const code = await this.generateOrderCode(tx);
      const order = await tx.order.create({
        data: {
          userId,
          code,
          status: OrderStatus.PENDING,
          paymentMethod: PaymentMethod.COD,
          deliveryTermsAccepted: true,
          subtotalCents,
          shippingFeeCents,
          serviceFeeCents: this.serviceFeeCents,
          discountCents: 0,
          totalCents,
          loyaltyDiscountCents: 0,
          loyaltyPointsUsed: 0,
          addressId: address.id,
          cartId: null,
          notes: 'Reorder',
          couponCode: null,
          providerId: source.providerId ?? undefined,
          branchId: branchId ?? undefined,
          deliveryMode,
          deliveryDistanceKm,
          deliveryRatePerKmCents,
          deliveryEtaMinutes,
          estimatedDeliveryTime,
          items: {
            create: orderItems.map((item) => {
              const optionCreates = item.options.map((option) => ({
                optionId: option.optionId,
                optionNameSnapshot: option.name,
                optionNameArSnapshot: option.nameAr ?? null,
                priceSnapshotCents: option.priceCents,
                qty: option.qty,
              }));
              return {
                productId: item.productId,
                productNameSnapshot: item.productName,
                priceSnapshotCents: item.priceCents,
                unitPriceCents: item.priceCents,
                unitCostCents: item.costCents ?? 0,
                lineTotalCents: item.priceCents * item.qty,
                lineProfitCents: (item.priceCents - (item.costCents ?? 0)) * item.qty,
                qty: item.qty,
                options: optionCreates.length ? { create: optionCreates } : undefined,
              };
            }),
          },
        },
      });

      const eventPayload = await this.buildOrderEventPayload(order.id, tx);
      const createdEvent = await this.automation.emit('order.created', eventPayload, {
        tx,
        dedupeKey: `order:${order.id}:${order.status}:reorder`,
      });
      automationEvents.push(createdEvent);

      return { orderId: order.id };
    }).catch(async (error) => {
      await this.rollbackStockForOrderItems(
        source.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          branchId: source.branchId ?? undefined,
        })),
      ).catch(() => undefined);
      throw error;
    });
      await this.automation.enqueueMany(automationEvents);
      await this.clearCachesForOrder(result.orderId, userId);
      await this.notifyOrderCreatedWhatsapp(result.orderId);
      return this.detail(userId, result.orderId);
    }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productId: true, qty: true, productNameSnapshot: true } },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.userId !== userId) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'You are not allowed to cancel this order', 403);
    }
    if (order.status === OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
    }
    if (order.status === OrderStatus.CANCELED) {
      await this.clearCachesForOrder(orderId, userId);
      return this.detail(userId, orderId);
    }
    const customerCancelable: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
    if (!customerCancelable.includes(order.status)) {
      throw new DomainError(
        ErrorCode.ORDER_CANCEL_NOT_ALLOWED,
        'Orders cannot be canceled after preparation begins',
        400,
      );
    }
    this.assertStatusTransition(order.status, OrderStatus.CANCELED, {
      deliveryMode: order.deliveryMode,
      driverId: order.driverId,
    });

    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELED },
        });
        const history = await tx.orderStatusHistory.create({
          data: {
            orderId,
            from: order.status,
            to: OrderStatus.CANCELED,
            note: 'Cancelled by customer',
            actorId: userId,
          },
        });
        await this.restockInventory(orderId, order.items, tx, userId, order.branchId ?? undefined);
        await this.billing.voidCommissionForOrder(orderId, tx);
        await this.refundRedeemedPoints(orderId, tx);
        await this.revokeLoyaltyForOrder(orderId, tx);
        await this.refreshOrderGroupTotals(order.orderGroupId, tx);
        const payload = await this.buildOrderEventPayload(orderId, tx);
        const event = await this.automation.emit('order.canceled', payload, {
          tx,
          dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
        });
        automationEvents.push(event);
        const statusChanged = await this.emitStatusChanged(tx, orderId, order.status, OrderStatus.CANCELED, history.id, userId);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );

      await this.automation.enqueueMany(automationEvents);
      await this.clearCachesForOrder(orderId, userId);
      await this.notifyOrderCancelledWhatsapp(orderId, 'Cancelled by customer');
      return this.detail(userId, orderId);
    }

  async updateStatus(
    orderId: string,
    nextStatus: OrderStatus,
    actorId?: string,
    note?: string,
    context?: { deliveryFailedReason?: DeliveryFailureReason; deliveryFailedNote?: string | null },
  ) {
    const before = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, userId: true, deliveryMode: true, driverId: true },
    });
    if (!before) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (before.status === nextStatus) {
      return { success: true, loyaltyEarned: 0 };
    }
    this.assertStatusTransition(before.status, nextStatus, {
      deliveryMode: before.deliveryMode,
      driverId: before.driverId,
    });
    if (nextStatus === OrderStatus.CANCELED) {
      return this.adminCancelOrder(orderId, actorId, note);
    }
    let loyaltyEarned = 0;
    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
        const statusUpdate: Prisma.OrderUpdateInput = { status: nextStatus };
        if (nextStatus === OrderStatus.OUT_FOR_DELIVERY) {
          statusUpdate.outForDeliveryAt = new Date();
        }
        if (nextStatus === OrderStatus.DELIVERED) {
          statusUpdate.deliveredAt = new Date();
        }
        if (nextStatus === OrderStatus.DELIVERY_FAILED) {
          statusUpdate.deliveryFailedAt = new Date();
          statusUpdate.deliveryFailedReason = context?.deliveryFailedReason ?? null;
          statusUpdate.deliveryFailedNote = context?.deliveryFailedNote ?? null;
        }
        if (before.status === OrderStatus.DELIVERY_FAILED && nextStatus !== OrderStatus.DELIVERY_FAILED) {
          statusUpdate.deliveryFailedAt = null;
          statusUpdate.deliveryFailedReason = null;
          statusUpdate.deliveryFailedNote = null;
        }
        await tx.order.update({ where: { id: orderId }, data: statusUpdate });
        const history = await tx.orderStatusHistory.create({
          data: { orderId, from: before.status as any, to: nextStatus as any, note: note ?? undefined, actorId },
        });
        if (nextStatus === OrderStatus.DELIVERED) {
          loyaltyEarned = await this.awardLoyaltyForOrder(orderId, tx);
          await this.finance.settleOrder(orderId, tx);
        }
        const automationEvent = await this.emitOrderStatusAutomationEvent(
          tx,
          orderId,
          nextStatus,
          `order:${orderId}:${nextStatus}:${history.id}`,
        );
        const statusChanged = await this.emitStatusChanged(tx, orderId, before.status, nextStatus, history.id, actorId);
        if (automationEvent) automationEvents.push(automationEvent);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );
    await this.automation.enqueueMany(automationEvents);
      await this.audit.log({
        action: 'order.status.change',
        entity: 'order',
        entityId: orderId,
        actorId,
        before: { status: before.status },
        after: { status: nextStatus, note },
      });
      await this.clearCachesForOrder(orderId, before.userId);
      await this.notifyOrderStatusWhatsapp(orderId);
      return { success: true, loyaltyEarned };
    }

  async adminCancelOrder(orderId: string, actorId?: string, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { productId: true, qty: true, productNameSnapshot: true } } },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.status === OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Delivered orders cannot be canceled', 400);
    }
    if (order.status === OrderStatus.CANCELED) {
      await this.clearCachesForOrder(orderId, order.userId);
      return { success: true };
    }
    this.assertStatusTransition(order.status, OrderStatus.CANCELED, {
      deliveryMode: order.deliveryMode,
      driverId: order.driverId,
    });

    const automationEvents: AutomationEventRef[] = [];
    await this.prisma.allowStatusUpdates(async () =>
      this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELED },
        });
        const history = await tx.orderStatusHistory.create({
          data: {
            orderId,
            from: order.status,
            to: OrderStatus.CANCELED,
            note: note ?? 'Cancelled by admin',
            actorId,
          },
        });
        await this.restockInventory(orderId, order.items, tx, actorId, order.branchId ?? undefined);
        await this.billing.voidCommissionForOrder(orderId, tx);
        await this.refundRedeemedPoints(orderId, tx);
        await this.revokeLoyaltyForOrder(orderId, tx);
        await this.refreshOrderGroupTotals(order.orderGroupId, tx);
        const payload = await this.buildOrderEventPayload(orderId, tx);
        const event = await this.automation.emit('order.canceled', payload, {
          tx,
          dedupeKey: `order:${orderId}:${OrderStatus.CANCELED}:${history.id}`,
        });
        automationEvents.push(event);
        const statusChanged = await this.emitStatusChanged(tx, orderId, order.status, OrderStatus.CANCELED, history.id, actorId);
        if (statusChanged) automationEvents.push(statusChanged);
      }),
    );

    await this.automation.enqueueMany(automationEvents);
      await this.audit.log({
        action: 'order.cancel',
        entity: 'order',
        entityId: orderId,
        actorId,
        before: { status: order.status },
        after: { status: OrderStatus.CANCELED },
      });
      await this.clearCachesForOrder(orderId, order.userId);
      await this.notifyOrderCancelledWhatsapp(orderId, note ?? 'Cancelled by admin');
      return { success: true };
    }

  private async restockInventory(
    orderId: string,
    items: { productId: string; qty: number; productNameSnapshot?: string | null }[],
    tx: Prisma.TransactionClient,
    actorId?: string,
    branchId?: string,
  ) {
    if (!items?.length) return;
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });
    const stockMap = new Map(products.map((p) => [p.id, p.stock ?? 0]));
    const branchProducts = branchId
      ? await tx.branchProduct.findMany({
          where: { branchId, productId: { in: productIds } },
        })
      : [];
    const branchProductMap = new Map(
      branchProducts.map((bp) => [`${bp.branchId}:${bp.productId}`, bp]),
    );
    for (const item of items) {
      const previous = stockMap.get(item.productId) ?? 0;
      const next = previous + item.qty;
      const branchProduct = branchId ? branchProductMap.get(`${branchId}:${item.productId}`) : undefined;
      let updatedProductStock = true;
      if (branchId && branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
        await tx.branchProduct.updateMany({
          where: { branchId, productId: item.productId },
          data: { stock: { increment: item.qty } },
        });
        updatedProductStock = false;
      }
      if (updatedProductStock) {
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        });
        await tx.productStockLog.create({
          data: {
            productId: item.productId,
            previousStock: previous,
            newStock: next,
            delta: item.qty,
            reason: 'order.cancel',
            actorId,
          },
        });
        stockMap.set(item.productId, next);
      }
    }
  }

  private async refundRedeemedPoints(orderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { userId: true, loyaltyPointsUsed: true },
    });
    if (!order || !order.loyaltyPointsUsed || order.loyaltyPointsUsed <= 0) {
      return 0;
    }
    if (!order.userId) {
      return 0;
    }
    const existing = await tx.loyaltyTransaction.findFirst({
      where: {
        orderId,
        type: 'ADJUST',
        metadata: { path: ['reason'], equals: 'order.cancel.refund' },
      },
    });
    if (existing) return existing.points;

    const points = order.loyaltyPointsUsed;
    await tx.user.update({
      where: { id: order.userId },
      data: { loyaltyPoints: { increment: points } },
    });
    await tx.loyaltyTransaction.create({
      data: {
        userId: order.userId,
        orderId,
        type: 'ADJUST',
        points,
        metadata: { reason: 'order.cancel.refund' },
      },
    });
    return points;
  }

  private async rollbackStockFromCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (!cart?.items?.length) return;
    await this.rollbackStockForOrderItems(
      cart.items.map((i) => ({ productId: i.productId, qty: i.qty, branchId: i.branchId ?? undefined })),
    );
  }

  private getAllowedTransitions(status: OrderStatus, context: StatusTransitionContext = {}): OrderStatus[] {
    const deliveryMode = context.deliveryMode ?? DeliveryMode.PLATFORM;
    switch (status) {
      case OrderStatus.PENDING:
        return [OrderStatus.CONFIRMED, OrderStatus.CANCELED];
      case OrderStatus.CONFIRMED:
        return [OrderStatus.PREPARING, OrderStatus.CANCELED];
      case OrderStatus.PREPARING: {
        const base: OrderStatus[] = [OrderStatus.CANCELED];
        const canDispatch = deliveryMode === DeliveryMode.MERCHANT || Boolean(context.driverId);
        if (canDispatch) {
          base.push(OrderStatus.OUT_FOR_DELIVERY);
        }
        if (deliveryMode === DeliveryMode.MERCHANT) {
          base.push(OrderStatus.DELIVERED);
        }
        return base;
      }
      case OrderStatus.OUT_FOR_DELIVERY:
        return [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED, OrderStatus.CANCELED];
      case OrderStatus.DELIVERY_FAILED:
        return [OrderStatus.PREPARING, OrderStatus.CANCELED];
      default:
        return [];
    }
  }

  private assertStatusTransition(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
    context: StatusTransitionContext = {},
  ) {
    if (currentStatus === nextStatus) return;
    const allowed = this.getAllowedTransitions(currentStatus, context);
    if (!allowed.includes(nextStatus)) {
      throw new DomainError(
        ErrorCode.ORDER_INVALID_STATUS_TRANSITION,
        `Cannot transition from ${currentStatus} to ${nextStatus}`,
      );
    }
    const deliveryMode = context.deliveryMode ?? DeliveryMode.PLATFORM;
    if (nextStatus === OrderStatus.OUT_FOR_DELIVERY && deliveryMode === DeliveryMode.PLATFORM && !context.driverId) {
      throw new DomainError(
        ErrorCode.ORDER_INVALID_STATUS_TRANSITION,
        'Driver must be assigned before marking out for delivery',
      );
    }
  }

  private formatStatusLabel(status: OrderStatus): string {
    return status.replace(/_/g, ' ');
  }

  private async resolveSavedPaymentMethod(
    userId: string,
    paymentMethod: PaymentMethodDto,
    paymentMethodId?: string | null,
  ) {
    if (paymentMethod === PaymentMethodDto.COD) return null;
    const desiredType = paymentMethod as PaymentMethod;
    const method = paymentMethodId
      ? await this.prisma.savedPaymentMethod.findFirst({
          where: { id: paymentMethodId, userId },
        })
      : await this.prisma.savedPaymentMethod.findFirst({
          where: { userId, isDefault: true, type: desiredType },
        }) ??
        (await this.prisma.savedPaymentMethod.findFirst({
          where: { userId, type: desiredType },
          orderBy: { createdAt: 'desc' },
        }));
    if (!method) {
      throw new DomainError(ErrorCode.PAYMENT_METHOD_REQUIRED, 'A saved payment method is required');
    }
    if (method.type !== desiredType) {
      throw new DomainError(
        ErrorCode.PAYMENT_METHOD_MISMATCH,
        'Saved payment method does not match the selected payment type',
      );
    }
    return method;
  }

  private resolveWalletConfig(payment: Record<string, any>, walletProvider?: string | null) {
    if (!walletProvider) return null;
    const providerKey = String(walletProvider).toUpperCase();
    const map: Record<string, string> = {
      VODAFONE_CASH: 'vodafoneCash',
      ORANGE_MONEY: 'orangeMoney',
      ETISALAT_CASH: 'etisalatCash',
    };
    const settingsKey = map[providerKey];
    if (!settingsKey) return null;
    return payment?.digitalWallets?.[settingsKey] ?? null;
  }

  private async assertPaymentMethodEnabled(
    paymentMethod: PaymentMethodDto,
    context: {
      userId?: string | null;
      guestPhone?: string | null;
      idempotencyKey?: string | null;
      walletProvider?: string | null;
    } = {},
  ) {
    const settings = await this.settings.getSettings();
    const payment = (settings.payment ?? {}) as Record<string, any>;
    const codEnabled = payment?.cashOnDelivery?.enabled !== false;
    const cardEnabled = payment?.creditCards?.enabled === true;
    const walletConfig = this.resolveWalletConfig(payment, context.walletProvider);
    const walletEnabled = walletConfig?.enabled === true;

    if (paymentMethod === PaymentMethodDto.COD && !codEnabled) {
      this.logger.warn({ msg: 'Payment method disabled', paymentMethod, ...context });
      throw new DomainError(ErrorCode.PAYMENT_METHOD_DISABLED, 'Cash on delivery is currently disabled');
    }
    if (paymentMethod === PaymentMethodDto.CARD && !cardEnabled) {
      this.logger.warn({ msg: 'Payment method disabled', paymentMethod, ...context });
      throw new DomainError(ErrorCode.PAYMENT_METHOD_DISABLED, 'Card payments are currently disabled');
    }
    if (paymentMethod === PaymentMethodDto.WALLET) {
      if (!context.walletProvider) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Wallet provider is required');
      }
      if (!walletEnabled) {
        this.logger.warn({ msg: 'Payment method disabled', paymentMethod, ...context });
        throw new DomainError(ErrorCode.PAYMENT_METHOD_DISABLED, 'Wallet payments are currently disabled');
      }
    }
  }

  private findLatestDriverLocation(driverId: string | null) {
    if (!driverId) return null;
    return this.prisma.deliveryDriverLocation.findFirst({
      where: { driverId },
      orderBy: { recordedAt: 'desc' },
      select: {
        driverId: true,
        lat: true,
        lng: true,
        accuracy: true,
        heading: true,
        speed: true,
        recordedAt: true,
      },
    });
  }

  private async rollbackStockForOrderItems(
    items: { productId: string; qty: number; branchId?: string }[],
  ) {
    if (!items?.length) return;
    for (const item of items) {
      let updatedProductStock = true;
      if (item.branchId) {
        const branchProduct = await this.prisma.branchProduct.findUnique({
          where: { branchId_productId: { branchId: item.branchId, productId: item.productId } },
        });
        if (branchProduct?.stock !== null && branchProduct?.stock !== undefined) {
          await this.prisma.branchProduct.updateMany({
            where: { branchId: item.branchId, productId: item.productId },
            data: { stock: { increment: item.qty } },
          });
          updatedProductStock = false;
        }
      }
      if (updatedProductStock) {
        await this.prisma.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        });
      }
    }
  }

  private mapStatusToAutomationEvent(status: OrderStatus): string | null {
    switch (status) {
      case OrderStatus.CONFIRMED:
        return 'order.confirmed';
      case OrderStatus.PREPARING:
        return 'order.preparing';
      case OrderStatus.OUT_FOR_DELIVERY:
        return 'order.out_for_delivery';
      case OrderStatus.DELIVERY_FAILED:
        return 'order.delivery_failed';
      case OrderStatus.DELIVERED:
        return 'order.delivered';
      case OrderStatus.CANCELED:
        return 'order.canceled';
      default:
        return null;
    }
  }

  private async emitStatusChanged(
    tx: Prisma.TransactionClient,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    historyId: string,
    actorId?: string,
  ) {
    const payload = await this.buildOrderEventPayload(orderId, tx);
    return this.automation.emit(
      'order.status_changed',
      {
        ...payload,
        from_status: this.toPublicStatus(from),
        to_status: this.toPublicStatus(to),
        from_internal: from,
        to_internal: to,
        actor_id: actorId ?? null,
        history_id: historyId,
        changed_at: new Date().toISOString(),
      },
      { tx, dedupeKey: `order:${orderId}:status_changed:${historyId}` },
    );
  }

  async emitOrderStatusAutomationEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    status: OrderStatus,
    dedupeKey: string,
  ) {
    const eventType = this.mapStatusToAutomationEvent(status);
    if (!eventType) return null;
    const payload = await this.buildOrderEventPayload(orderId, tx);
    return this.automation.emit(eventType, payload, {
      tx,
      dedupeKey,
    });
  }

  private async buildOrderEventPayload(
    orderId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { phone: true, name: true } },
        address: { select: { zoneId: true, label: true, city: true, street: true, building: true, apartment: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        items: { select: { productNameSnapshot: true, qty: true } },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    const items = order.items.map((item) => ({
      name: item.productNameSnapshot,
      qty: item.qty,
    }));
    const guestAddress = (order as any).guestAddress as Record<string, any> | null | undefined;
    return {
      order_id: order.id,
      order_code: order.code ?? order.id,
      status: this.toPublicStatus(order.status),
      status_internal: order.status,
      customer_phone: order.user?.phone ?? (order as any).guestPhone ?? null,
      customer_name: order.user?.name ?? (order as any).guestName ?? null,
      total_cents: order.totalCents,
      total_formatted: (order.totalCents / 100).toFixed(2),
      payment_method: order.paymentMethod,
      items,
      items_summary: items.map((i) => `${i.name} x${i.qty}`).join(', '),
      delivery_zone: {
        id: order.deliveryZoneId,
        name: order.deliveryZoneName,
      },
      eta_minutes: order.deliveryEtaMinutes ?? null,
      estimated_delivery_time: order.estimatedDeliveryTime ?? null,
      delivery_failed_at: order.deliveryFailedAt ? order.deliveryFailedAt.toISOString() : null,
      delivery_failed_reason: order.deliveryFailedReason ?? null,
      delivery_failed_note: order.deliveryFailedNote ?? null,
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.fullName,
            phone: order.driver.phone,
          }
        : null,
      address: order.address
        ? {
            label: order.address.label,
            city: order.address.city,
            street: order.address.street,
            building: order.address.building,
            apartment: order.address.apartment,
            zone_id: order.address.zoneId,
          }
        : guestAddress
          ? {
              label: guestAddress.fullAddress ?? guestAddress.street ?? null,
              city: guestAddress.city ?? null,
              street: guestAddress.street ?? guestAddress.fullAddress ?? null,
              building: guestAddress.building ?? null,
              apartment: guestAddress.apartment ?? null,
              zone_id: null,
            }
          : null,
    };
  }

  private toPublicStatus(status: OrderStatus): PublicStatus {
    switch (status) {
      case OrderStatus.CONFIRMED:
        return 'CONFIRMED';
      case OrderStatus.PREPARING:
        return 'PREPARING';
      case OrderStatus.OUT_FOR_DELIVERY:
        return 'OUT_FOR_DELIVERY';
      case OrderStatus.DELIVERY_FAILED:
        return 'DELIVERY_FAILED';
      case OrderStatus.DELIVERED:
        return 'DELIVERED';
      case OrderStatus.CANCELED:
        return 'CANCELED';
      default:
        return 'PENDING';
    }
  }

  private async notifyOrderCreatedWhatsapp(orderId: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
      await this.sendProviderNewOrderWhatsapp(context, lang, settings);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order created notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async notifyOrderStatusWhatsapp(orderId: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order status notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async notifyOrderCancelledWhatsapp(orderId: string, reason?: string) {
    try {
      const context = await this.loadOrderWhatsappContext(orderId);
      if (!context) return;
      const settings = await this.settings.getSettings();
      const lang = this.resolveWhatsappLanguage(settings.language);
      await this.sendCustomerOrderStatusWhatsapp(context, lang, settings);
      await this.sendProviderOrderCancelledWhatsapp(context, lang, reason ?? undefined);
    } catch (err) {
      this.logger.warn({ msg: 'WhatsApp order cancel notification failed', orderId, error: (err as Error)?.message });
    }
  }

  private async loadOrderWhatsappContext(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        status: true,
        deliveryEtaMinutes: true,
        estimatedDeliveryTime: true,
        totalCents: true,
        notes: true,
        guestPhone: true,
        user: { select: { phone: true } },
        providerId: true,
        provider: { select: { contactPhone: true } },
        items: { select: { qty: true } },
      },
    });
  }

  private async sendCustomerOrderStatusWhatsapp(
    order: {
      id: string;
      code: string | null;
      status: OrderStatus;
      deliveryEtaMinutes: number | null;
      estimatedDeliveryTime: string | null;
      guestPhone: string | null;
      user: { phone: string } | null;
    },
    lang: WhatsappTemplateLanguage,
    settings: { contactPhone?: string | null },
  ) {
    const phone = order.user?.phone ?? order.guestPhone;
    if (!phone) return;
    const idempotencyKey = `order:${order.id}:status:${order.status}`;
    const existing = await this.prisma.whatsAppMessageLog.findFirst({
      where: {
        direction: 'OUTBOUND',
        payload: { path: ['metadata', 'idempotencyKey'], equals: idempotencyKey },
      },
    });
    if (existing) return;
    const eta = this.localizeEta(lang, order.deliveryEtaMinutes ?? undefined) || order.estimatedDeliveryTime || '';
    const supportHint = this.buildSupportHint(settings, lang);
    await this.notifications.sendWhatsappTemplate({
      to: phone,
      template: 'order_status_update_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        status: this.localizeOrderStatus(order.status, lang),
        eta,
        support_hint: supportHint,
      },
      metadata: { orderId: order.id, status: order.status, idempotencyKey },
    });
  }

  private async sendProviderNewOrderWhatsapp(
    order: {
      id: string;
      code: string | null;
      notes: string | null;
      totalCents: number;
      providerId: string | null;
      provider: { contactPhone: string | null } | null;
      items: Array<{ qty: number }>;
    },
    lang: WhatsappTemplateLanguage,
    settings: { currency?: string | null },
  ) {
    if (!order.providerId) return;
    const enabled = await this.isProviderWhatsappEnabled(order.providerId, 'newOrders');
    if (!enabled) return;
    const phone = await this.resolveProviderWhatsappPhone(order.providerId, order.provider?.contactPhone ?? null);
    if (!phone) return;
    const itemsCount = order.items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
    const currency = settings.currency ?? 'EGP';
    const totalAmount = `${currency} ${(order.totalCents / 100).toFixed(2)}`;
    await this.notifications.sendWhatsappTemplate({
      to: phone,
      template: 'provider_new_order_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        items_count: itemsCount,
        total_amount: totalAmount,
        notes: order.notes ?? '-',
      },
      metadata: { orderId: order.id },
    });
  }

  private async sendProviderOrderCancelledWhatsapp(
    order: {
      id: string;
      code: string | null;
      providerId: string | null;
      provider: { contactPhone: string | null } | null;
    },
    lang: WhatsappTemplateLanguage,
    reason?: string,
  ) {
    if (!order.providerId) return;
    const enabled = await this.isProviderWhatsappEnabled(order.providerId, 'newOrders');
    if (!enabled) return;
    const phone = await this.resolveProviderWhatsappPhone(order.providerId, order.provider?.contactPhone ?? null);
    if (!phone) return;
    await this.notifications.sendWhatsappTemplate({
      to: phone,
      template: 'provider_order_cancelled_v1',
      language: lang,
      variables: {
        order_no: order.code ?? order.id,
        reason: reason ?? 'Canceled',
      },
      metadata: { orderId: order.id },
    });
  }

  private resolveWhatsappLanguage(value?: string | null): WhatsappTemplateLanguage {
    return normalizeWhatsappLanguage(value ?? undefined);
  }

  private localizeOrderStatus(status: OrderStatus, lang: WhatsappTemplateLanguage) {
    const mapping: Record<OrderStatus, { en: string; ar: string }> = {
      PENDING: { en: 'Pending', ar: '\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631' },
      CONFIRMED: { en: 'Confirmed', ar: '\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0637\u0644\u0628' },
      PREPARING: { en: 'Preparing', ar: '\u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631' },
      OUT_FOR_DELIVERY: { en: 'Out for delivery', ar: '\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642' },
      DELIVERY_FAILED: { en: 'Delivery failed', ar: '\u0641\u0634\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      DELIVERED: { en: 'Delivered', ar: '\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      CANCELED: { en: 'Canceled', ar: '\u062A\u0645 \u0627\u0644\u0625\u0644\u063A\u0627\u0621' },
    };
    const label = mapping[status] ?? { en: status, ar: status };
    return lang === 'ar' ? label.ar : label.en;
  }

  private localizeEta(lang: WhatsappTemplateLanguage, minutes?: number) {
    if (!minutes || minutes <= 0) return '';
    if (lang === 'ar') {
      return `\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u062A\u0648\u0642\u0639: ${minutes} \u062F\u0642\u064A\u0642\u0629`;
    }
    return `ETA: ${minutes} min`;
  }

  private buildSupportHint(settings: { contactPhone?: string | null }, lang: WhatsappTemplateLanguage) {
    if (settings.contactPhone) {
      return lang === 'ar'
        ? `\u062F\u0639\u0645: ${settings.contactPhone}`
        : `Support: ${settings.contactPhone}`;
    }
    return lang === 'ar'
      ? '\u0627\u0631\u062F \u0628\u0643\u0644\u0645\u0629 \u0645\u0633\u0627\u0639\u062F\u0629 \u0644\u0644\u062F\u0639\u0645'
      : 'Reply HELP for support';
  }

  private async resolveProviderWhatsappPhone(providerId: string, fallback?: string | null) {
    if (fallback) return fallback;
    const owner = await this.prisma.providerUser.findFirst({
      where: { providerId, role: { in: ['OWNER', 'MANAGER'] } },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { phone: true } } },
    });
    return owner?.user?.phone ?? null;
  }

  private async isProviderWhatsappEnabled(providerId: string, key: 'newOrders' | 'invoiceUpdates') {
    const preference = await this.prisma.providerNotificationPreference.findUnique({ where: { providerId } });
    const payload = preference?.preferences as Record<string, any> | undefined;
    const channel = payload?.[key];
    if (channel && typeof channel === 'object' && 'whatsapp' in channel) {
      return Boolean(channel.whatsapp);
    }
    return true;
  }

  private toOrderDetail(order: OrderWithRelations, zone?: any) {
    const guestAddress = (order as any).guestAddress as Record<string, any> | null | undefined;
    const serviceFeeCents =
      order.serviceFeeCents ??
      this.inferServiceFeeCents({
        subtotalCents: order.subtotalCents,
        shippingFeeCents: order.shippingFeeCents ?? 0,
        discountCents: order.discountCents ?? 0,
        loyaltyDiscountCents: order.loyaltyDiscountCents ?? 0,
        totalCents: order.totalCents ?? 0,
      });
    return {
      id: order.id,
      code: order.code ?? order.id,
      userId: order.userId,
      status: this.toPublicStatus(order.status),
      paymentMethod: order.paymentMethod,
      subtotalCents: order.subtotalCents,
      shippingFeeCents: order.shippingFeeCents,
      serviceFeeCents,
      discountCents: order.discountCents,
      loyaltyDiscountCents: order.loyaltyDiscountCents,
      loyaltyPointsUsed: order.loyaltyPointsUsed,
      loyaltyPointsEarned: (order as any).loyaltyPointsEarned ?? 0,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      note: order.notes ?? undefined,
      estimatedDeliveryTime: order.estimatedDeliveryTime ?? undefined,
      deliveryEtaMinutes: order.deliveryEtaMinutes ?? undefined,
      deliveryZoneId: order.deliveryZoneId ?? undefined,
      deliveryZoneName: order.deliveryZoneName ?? undefined,
      deliveryFailedAt: order.deliveryFailedAt ?? undefined,
      deliveryFailedReason: order.deliveryFailedReason ?? undefined,
      deliveryFailedNote: order.deliveryFailedNote ?? undefined,
      providerId: order.providerId ?? undefined,
      branchId: order.branchId ?? undefined,
      deliveryMode: order.deliveryMode ?? undefined,
      deliveryDistanceKm: order.deliveryDistanceKm ?? undefined,
      deliveryRatePerKmCents: order.deliveryRatePerKmCents ?? undefined,
      guestName: (order as any).guestName ?? undefined,
      guestPhone: (order as any).guestPhone ?? undefined,
      contactPhone: order.userId ? undefined : ((order as any).guestPhone ?? undefined),
      deliveryZone: zone
        ? {
            id: zone.id,
            nameEn: zone.nameEn,
            nameAr: zone.nameAr,
            city: zone.city,
            region: zone.region,
            feeCents: zone.feeCents,
            etaMinutes: zone.etaMinutes,
            isActive: zone.isActive,
            freeDeliveryThresholdCents: zone.freeDeliveryThresholdCents,
            minOrderAmountCents: zone.minOrderAmountCents,
          }
        : undefined,
      address: order.address
        ? {
            id: order.address.id,
            label: order.address.label,
            city: order.address.city,
            zoneId: order.address.zoneId,
            street: order.address.street,
            building: order.address.building,
            apartment: order.address.apartment,
          }
        : guestAddress
          ? {
              id: order.addressId ?? `guest-${order.id}`,
              label: guestAddress.fullAddress ?? guestAddress.street ?? 'Guest address',
              city: guestAddress.city ?? guestAddress.region ?? '',
              zoneId: null,
              street: guestAddress.street ?? guestAddress.fullAddress ?? '',
              building: guestAddress.building ?? null,
              apartment: guestAddress.apartment ?? null,
              notes: guestAddress.notes ?? null,
              region: guestAddress.region ?? null,
            }
          : null,
      driver: order.driver
        ? {
            id: order.driver.id,
            fullName: order.driver.fullName,
            phone: order.driver.phone,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        priceSnapshotCents: item.priceSnapshotCents,
        qty: item.qty,
      })),
      etag: order.updatedAt ? `${order.id}-${order.updatedAt.getTime()}` : order.id,
    };
  }
}
