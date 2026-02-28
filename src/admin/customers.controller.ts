import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AdjustLoyaltyPointsDto, LoyaltyHistoryQueryDto } from '../loyalty/dto/loyalty.dto';

class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(6)
  newPassword!: string;
}

class AdminCustomerQueryDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'search name/phone/email' })
  @IsOptional()
  @IsString()
  q?: string;
}

@ApiTags('Admin/Customers')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/customers', version: ['1'] })
export class AdminCustomersController {
  constructor(
    private readonly svc: AdminService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated customers' })
  async list(@Query() query: AdminCustomerQueryDto) {
    const { q, ...page } = query;
    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, phone: true, email: true, role: true, loyaltyPoints: true, createdAt: true },
        skip: (page as PaginationDto).skip, take: (page as PaginationDto).take,
      }),
      this.svc.prisma.user.count({ where }),
    ]);
    const userIds = items.map((item) => item.id);
    const orderSummaries = userIds.length
      ? await this.svc.prisma.order.groupBy({
          where: { userId: { in: userIds } },
          by: ['userId'],
          _count: { _all: true },
          _sum: { totalCents: true },
        })
      : [];
    const summaryByUserId = new Map(
      orderSummaries
        .filter((item) => item.userId)
        .map((item) => [
          item.userId as string,
          {
            ordersCount: item._count?._all ?? 0,
            totalSpentCents: item._sum?.totalCents ?? 0,
          },
        ]),
    );
    return {
      items: items.map((item) => {
        const summary = summaryByUserId.get(item.id);
        return {
          id: item.id,
          name: item.name,
          phone: item.phone,
          email: item.email,
          role: item.role,
          createdAt: item.createdAt,
          ordersCount: summary?.ordersCount ?? 0,
          totalSpentCents: summary?.totalSpentCents ?? 0,
          loyaltyTier: this.resolveLoyaltyTier(item.loyaltyPoints ?? 0),
        };
      }),
      total,
      page: page?.page,
      pageSize: page?.pageSize,
    };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Customer profile & recent orders' })
  async detail(@Param('id') id: string) {
    const user = await this.svc.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        loyaltyPoints: true,
        createdAt: true,
        addresses: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const orders = await this.svc.prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        totalCents: true,
        subtotalCents: true,
        status: true,
        createdAt: true,
        couponCode: true,
        couponId: true,
        discountCents: true,
        shippingFeeCents: true,
        deliveryBaseFeeCents: true,
        deliveryAppliedFeeCents: true,
        deliveryCampaignId: true,
        providerId: true,
        provider: { select: { id: true, name: true } },
        items: {
          select: {
            productId: true,
            productNameSnapshot: true,
            qty: true,
            lineTotalCents: true,
          },
        },
      },
    });

    const couponIds = Array.from(
      new Set(orders.map((order) => order.couponId).filter((couponId): couponId is string => Boolean(couponId))),
    );
    const fallbackCouponCodes = Array.from(
      new Set(
        orders
          .filter((order) => !order.couponId)
          .map((order) => order.couponCode)
          .filter((code): code is string => Boolean(code)),
      ),
    );
    const coupons = couponIds.length || fallbackCouponCodes.length
      ? await this.svc.prisma.coupon.findMany({
          where: {
            OR: [
              ...(couponIds.length ? [{ id: { in: couponIds } }] : []),
              ...(fallbackCouponCodes.length ? [{ code: { in: fallbackCouponCodes } }] : []),
            ],
          },
          select: { id: true, code: true },
        })
      : [];
    const couponIdByCode = new Map(coupons.map((coupon) => [coupon.code, coupon.id]));

    const vendorBreakdown = new Map<
      string,
      { providerId: string | null; providerName: string; ordersCount: number; totalSpentCents: number }
    >();
    const topProducts = new Map<
      string,
      { productId: string; productName: string; quantity: number; totalSpentCents: number }
    >();

    let totalSpentCents = 0;
    let couponsUsedCount = 0;
    let deliveryCampaignOrdersCount = 0;

    const normalizedOrders = orders.map((order) => {
      totalSpentCents += order.totalCents ?? 0;
      if (order.couponCode) {
        couponsUsedCount += 1;
      }
      if (order.deliveryCampaignId) {
        deliveryCampaignOrdersCount += 1;
      }

      const providerKey = order.providerId ?? '__unknown__';
      const providerName = order.provider?.name ?? 'Unknown provider';
      const providerEntry = vendorBreakdown.get(providerKey) ?? {
        providerId: order.providerId ?? null,
        providerName,
        ordersCount: 0,
        totalSpentCents: 0,
      };
      providerEntry.ordersCount += 1;
      providerEntry.totalSpentCents += order.totalCents ?? 0;
      vendorBreakdown.set(providerKey, providerEntry);

      for (const item of order.items) {
        const productKey = item.productId;
        const productEntry = topProducts.get(productKey) ?? {
          productId: item.productId,
          productName: item.productNameSnapshot,
          quantity: 0,
          totalSpentCents: 0,
        };
        productEntry.quantity += item.qty ?? 0;
        productEntry.totalSpentCents += item.lineTotalCents ?? 0;
        topProducts.set(productKey, productEntry);
      }

      const deliveryBaseFeeCents = order.deliveryBaseFeeCents ?? order.shippingFeeCents ?? 0;
      const deliveryAppliedFeeCents =
        order.deliveryAppliedFeeCents ?? order.shippingFeeCents ?? deliveryBaseFeeCents;
      const deliveryDiscountCents = Math.max((deliveryBaseFeeCents ?? 0) - (deliveryAppliedFeeCents ?? 0), 0);
      const couponDiscountCents = order.couponCode ? Math.max(order.discountCents ?? 0, 0) : 0;
      const totalDiscountCents = couponDiscountCents + deliveryDiscountCents;
      const discountSource =
        couponDiscountCents > 0 && deliveryDiscountCents > 0
          ? 'both'
          : couponDiscountCents > 0
            ? 'coupon'
            : deliveryDiscountCents > 0
              ? 'deliveryCampaign'
              : 'none';
      const deliveryPricingType =
        deliveryAppliedFeeCents <= 0 ? 'FREE' : deliveryAppliedFeeCents < deliveryBaseFeeCents ? 'DISCOUNTED' : 'REGULAR';

      return {
        id: order.id,
        code: order.code,
        status: order.status,
        createdAt: order.createdAt,
        totalCents: order.totalCents,
        subtotalCents: order.subtotalCents,
        providerId: order.providerId,
        providerName,
        couponCode: order.couponCode,
        couponId: order.couponId ?? (order.couponCode ? couponIdByCode.get(order.couponCode) ?? null : null),
        deliveryCampaignId: order.deliveryCampaignId ?? null,
        delivery: {
          baseFeeCents: deliveryBaseFeeCents,
          appliedFeeCents: deliveryAppliedFeeCents,
          pricingType: deliveryPricingType,
          discountAmountCents: deliveryDiscountCents,
        },
        discounts: {
          couponDiscountCents,
          deliveryDiscountCents,
          totalDiscountCents,
          source: discountSource,
        },
        items: order.items.map((item) => ({
          productId: item.productId,
          productName: item.productNameSnapshot,
          quantity: item.qty,
          totalSpentCents: item.lineTotalCents ?? 0,
        })),
      };
    });

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      loyaltyPoints: user.loyaltyPoints,
      createdAt: user.createdAt,
      addresses: user.addresses,
      metrics: {
        totalOrders: orders.length,
        totalSpentCents,
        couponsUsedCount,
        deliveryCampaignOrdersCount,
        vendorsCount: vendorBreakdown.size,
      },
      vendorBreakdown: Array.from(vendorBreakdown.values()).sort(
        (left, right) =>
          right.totalSpentCents - left.totalSpentCents || right.ordersCount - left.ordersCount,
      ),
      topProducts: Array.from(topProducts.values())
        .sort(
          (left, right) =>
            right.quantity - left.quantity || right.totalSpentCents - left.totalSpentCents,
        )
        .slice(0, 10),
      orders: normalizedOrders,
    };
  }

  @Patch(':id/role')
  @ApiOkResponse({ description: 'Update user role' })
  updateRole(@Param('id') id: string, @Body() dto: { role: UserRole }) {
    return this.svc.prisma.user.update({ where: { id }, data: { role: dto.role } });
  }

  @Patch(':id/password')
  @StaffOrAdmin()
  @ApiOkResponse({ description: 'Reset user password' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.svc.prisma.user.update({ where: { id }, data: { password: hash } });
    return { ok: true };
  }

  @Get(':id/loyalty')
  @ApiOkResponse({ description: 'Loyalty totals and transaction history' })
  loyaltyHistory(@Param('id') id: string, @Query() query: LoyaltyHistoryQueryDto) {
    return this.loyalty.getAdminSummary(id, { historyLimit: query.limit });
  }

  @Post(':id/loyalty-adjust')
  @ApiOkResponse({ description: 'Adjust loyalty balance' })
  adjustLoyalty(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AdjustLoyaltyPointsDto,
  ) {
    return this.loyalty.adjustUserPoints({
      userId: id,
      points: dto.points,
      reason: dto.reason,
      actorId: actor.userId,
    });
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete customer (only when no orders exist)' })
  async deleteCustomer(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    const user = await this.svc.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot delete admin users');
    }

    const ordersCount = await this.svc.prisma.order.count({ where: { userId: id } });
    if (ordersCount > 0) {
      throw new BadRequestException('Cannot delete user with existing orders');
    }

    await this.svc.prisma.$transaction([
      this.svc.prisma.cartItem.deleteMany({ where: { cart: { userId: id } } }),
      this.svc.prisma.cart.deleteMany({ where: { userId: id } }),
      this.svc.prisma.address.deleteMany({ where: { userId: id } }),
      this.svc.prisma.sessionLog.deleteMany({ where: { userId: id } }),
      this.svc.prisma.loyaltyTransaction.deleteMany({ where: { userId: id } }),
      this.svc.prisma.loyaltyCycle.deleteMany({ where: { userId: id } }),
      this.svc.prisma.notificationDevice.deleteMany({ where: { userId: id } }),
      this.svc.prisma.telegramLink.deleteMany({ where: { userId: id } }),
      this.svc.prisma.user.delete({ where: { id } }),
    ]);

    await this.svc.audit.log({
      action: 'user.delete',
      entity: 'user',
      entityId: id,
      before: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      after: null,
      actorId: actor?.userId,
    });

    return { ok: true };
  }

  private resolveLoyaltyTier(points: number) {
    if (points >= 5000) return 'Platinum';
    if (points >= 2500) return 'Gold';
    if (points >= 1000) return 'Silver';
    return 'Bronze';
  }
}
