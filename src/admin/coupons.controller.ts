import { Body, Controller, Get, Logger, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import { TwoFaGuard } from '../common/guards/twofa.guard';
import { Throttle } from '@nestjs/throttler';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Admin/Coupons')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(TwoFaGuard)
@Throttle({ default: { limit: 20, ttl: 60 } })
@Controller({ path: 'admin/coupons', version: ['1'] })
export class AdminCouponsController {
  private readonly logger = new Logger(AdminCouponsController.name);

  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ description: 'Paginated coupons' })
  async list(@Query('q') q?: string, @Query() page?: PaginationDto) {
    const where: any = {};
    if (q) where.code = { contains: q, mode: 'insensitive' };
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page?.skip, take: page?.take }),
      this.svc.prisma.coupon.count({ where }),
    ]);
    return { items, total, page: page?.page, pageSize: page?.pageSize };
  }

  @Get(':id/insights')
  @ApiOkResponse({ description: 'Coupon usage insights and affected sales' })
  async insights(@Param('id') id: string) {
    const coupon = await this.svc.prisma.coupon.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        type: true,
        valueCents: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const orders = await this.svc.prisma.order.findMany({
      where: {
        OR: [
          { couponId: coupon.id },
          { couponCode: coupon.code },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        userId: true,
        guestName: true,
        guestPhone: true,
        totalCents: true,
        discountCents: true,
        createdAt: true,
        providerId: true,
        provider: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, phone: true, email: true } },
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

    const customerStats = new Map<
      string,
      {
        userId: string | null;
        name: string;
        phone: string | null;
        email: string | null;
        usageCount: number;
        totalDiscountCents: number;
        totalSalesCents: number;
        vendorIds: Set<string>;
        vendorNames: Set<string>;
      }
    >();
    const vendorStats = new Map<
      string,
      { providerId: string | null; providerName: string; usageCount: number; totalSalesCents: number; totalDiscountCents: number }
    >();
    const productStats = new Map<
      string,
      { productId: string; productName: string; quantity: number; totalSpentCents: number }
    >();

    let totalDiscountCents = 0;
    let totalSalesCents = 0;

    const recentOrders = orders.slice(0, 20).map((order) => ({
      id: order.id,
      code: order.code,
      createdAt: order.createdAt,
      totalCents: order.totalCents,
      discountCents: order.discountCents ?? 0,
      customer: order.user
        ? {
            id: order.user.id,
            name: order.user.name,
            phone: order.user.phone,
            email: order.user.email,
          }
        : {
            id: null,
            name: order.guestName ?? 'Guest',
            phone: order.guestPhone ?? null,
            email: null,
          },
      provider: order.provider
        ? {
            id: order.provider.id,
            name: order.provider.name,
          }
        : null,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productNameSnapshot,
        quantity: item.qty,
        totalSpentCents: item.lineTotalCents ?? 0,
      })),
    }));

    for (const order of orders) {
      const discountCents = Math.max(order.discountCents ?? 0, 0);
      const salesCents = order.totalCents ?? 0;
      totalDiscountCents += discountCents;
      totalSalesCents += salesCents;

      const providerKey = order.providerId ?? '__unknown__';
      const providerEntry = vendorStats.get(providerKey) ?? {
        providerId: order.providerId ?? null,
        providerName: order.provider?.name ?? 'Unknown provider',
        usageCount: 0,
        totalSalesCents: 0,
        totalDiscountCents: 0,
      };
      providerEntry.usageCount += 1;
      providerEntry.totalSalesCents += salesCents;
      providerEntry.totalDiscountCents += discountCents;
      vendorStats.set(providerKey, providerEntry);

      const customerKey = order.userId ?? `guest:${order.guestPhone ?? order.id}`;
      const customerEntry = customerStats.get(customerKey) ?? {
        userId: order.userId ?? null,
        name: order.user?.name ?? order.guestName ?? 'Guest',
        phone: order.user?.phone ?? order.guestPhone ?? null,
        email: order.user?.email ?? null,
        usageCount: 0,
        totalDiscountCents: 0,
        totalSalesCents: 0,
        vendorIds: new Set<string>(),
        vendorNames: new Set<string>(),
      };
      customerEntry.usageCount += 1;
      customerEntry.totalDiscountCents += discountCents;
      customerEntry.totalSalesCents += salesCents;
      if (order.providerId) {
        customerEntry.vendorIds.add(order.providerId);
      }
      if (order.provider?.name) {
        customerEntry.vendorNames.add(order.provider.name);
      }
      customerStats.set(customerKey, customerEntry);

      for (const item of order.items) {
        const productEntry = productStats.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productNameSnapshot,
          quantity: 0,
          totalSpentCents: 0,
        };
        productEntry.quantity += item.qty ?? 0;
        productEntry.totalSpentCents += item.lineTotalCents ?? 0;
        productStats.set(item.productId, productEntry);
      }
    }

    return {
      coupon,
      totals: {
        ordersCount: orders.length,
        customersCount: customerStats.size,
        vendorsCount: vendorStats.size,
        totalDiscountCents,
        totalSalesCents,
      },
      customers: Array.from(customerStats.values())
        .map((customer) => ({
          userId: customer.userId,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          usageCount: customer.usageCount,
          totalDiscountCents: customer.totalDiscountCents,
          totalSalesCents: customer.totalSalesCents,
          vendorIds: Array.from(customer.vendorIds),
          vendorNames: Array.from(customer.vendorNames),
        }))
        .sort(
          (left, right) =>
            right.usageCount - left.usageCount || right.totalSalesCents - left.totalSalesCents,
        ),
      vendors: Array.from(vendorStats.values()).sort(
        (left, right) =>
          right.usageCount - left.usageCount || right.totalSalesCents - left.totalSalesCents,
      ),
      topProducts: Array.from(productStats.values())
        .sort(
          (left, right) =>
            right.quantity - left.quantity || right.totalSpentCents - left.totalSpentCents,
        )
        .slice(0, 10),
      recentOrders,
    };
  }

  @Post()
  create(@Body() dto: any) {
    // dto: { code, type, valueCents|percent, startsAt?, endsAt?, isActive?, minOrderCents?, maxDiscountCents? }
    const data: any = { ...dto, type: (dto.type as string | undefined) ?? 'PERCENT' };
    const suppliedValue = dto.percent ?? dto.value ?? dto.valueCents;
    data.valueCents = suppliedValue != null ? Number(suppliedValue) : 0;

    if (data.type === 'PERCENT' && data.valueCents < 0) {
      throw new BadRequestException('percent (valueCents) must be >= 0');
    }
    if (data.type === 'FIXED' && data.valueCents < 0) {
      throw new BadRequestException('valueCents must be >= 0 for FIXED coupons');
    }
    const createdPromise = this.svc.prisma.coupon.create({ data });
    createdPromise.then(async (coupon) => {
      this.logger.log({ msg: 'Coupon created', couponId: coupon.id, code: coupon.code, type: coupon.type });
      await this.svc.audit.log({
        action: 'coupon.create',
        entity: 'Coupon',
        entityId: coupon.id,
        after: coupon,
      });
    });
    return createdPromise;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.prisma.$transaction(async (tx) => {
      const before = await tx.coupon.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Coupon not found');
      }
      const data: any = { ...dto };
      const suppliedValue = dto.percent ?? dto.value ?? dto.valueCents;
      if (suppliedValue != null) {
        data.type = dto.type ?? 'PERCENT';
        data.valueCents = Number(suppliedValue);
      } else if (before.valueCents != null) {
        data.valueCents = before.valueCents;
      }
      if ((data.type ?? before.type) === 'PERCENT' && data.valueCents < 0) {
        throw new BadRequestException('percent (valueCents) must be >= 0');
      }
      if ((data.type ?? before.type) === 'FIXED' && data.valueCents < 0) {
        throw new BadRequestException('valueCents must be >= 0 for FIXED coupons');
      }
      const updated = await tx.coupon.update({ where: { id }, data });
      this.logger.log({ msg: 'Coupon updated', couponId: updated.id, code: updated.code, isActive: updated.isActive });
      await this.svc.audit.log({
        action: 'coupon.update',
        entity: 'Coupon',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
  }
}
