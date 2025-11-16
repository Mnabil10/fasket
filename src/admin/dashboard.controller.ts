import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { LimitDto, RangeDto, ThresholdDto, TimeSeriesDto } from './dto/dashboard.dto';
import { Prisma } from '@prisma/client';

@ApiTags('Admin/Dashboard')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/dashboard', version: ['1'] })
export class AdminDashboardController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiOkResponse({ description: 'Sales Summary, status breakdown, recent orders, top products, low stock, customers count' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date inclusive' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date inclusive' })
  async summary(@Query() range: RangeDto) {
    const whereDate: any = {};
    if (range.from || range.to) whereDate.createdAt = {};
    if (range.from) whereDate.createdAt.gte = new Date(range.from!);
    if (range.to) whereDate.createdAt.lte = new Date(range.to!);

    const kpiWhere = {
      ...(whereDate.createdAt ? { createdAt: whereDate.createdAt } : {}),
      status: { in: ['DELIVERED', 'OUT_FOR_DELIVERY', 'PROCESSING', 'PENDING'] as any },
    };

    const [ordersForKpi, byStatus, recent, customersCount, lowStock, topRaw] =
      await this.svc.prisma.$transaction([
        this.svc.prisma.order.findMany({ where: kpiWhere, select: { totalCents: true } }),
        // Add orderBy to satisfy Prisma's groupBy typing
        this.svc.prisma.order.groupBy({
          by: ['status'],
          _count: { status: true },
          where: whereDate.createdAt ? { createdAt: whereDate.createdAt } : undefined,
          orderBy: { status: 'asc' },
        }),
        this.svc.prisma.order.findMany({
          where: whereDate.createdAt ? { createdAt: whereDate.createdAt } : undefined,
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            totalCents: true,
            status: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        }),
        this.svc.prisma.user.count(),
        this.svc.prisma.product.findMany({
          where: { stock: { lt: 10 }, status: 'ACTIVE' as any },
          select: { id: true, name: true, stock: true },
          orderBy: { stock: 'asc' },
          take: 10,
        }),
        this.svc.prisma.orderItem.groupBy({ by: ['productId'], _sum: { qty: true }, orderBy: { _sum: { qty: 'desc' } }, take: 10 }),
      ]);

    const totalRevenueCents = ordersForKpi.reduce((s, o) => s + o.totalCents, 0);
    const totalOrders = ordersForKpi.length;
    const avgOrderValueCents = totalOrders ? Math.round(totalRevenueCents / totalOrders) : 0;

    const productIds = topRaw.map((t) => t.productId);
    const products = await this.svc.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    // Use optional chaining on _sum so missing aggregates do not throw
    const topProducts = topRaw.map((tr) => ({
      productId: tr.productId,
      qty: tr._sum?.qty ?? 0,
      name: products.find((p) => p.id === tr.productId)?.name,
    }));

    return {
      sales: { totalRevenueCents, totalOrders, avgOrderValueCents },
      byStatus,
      recent,
      topProducts,
      lowStock,
      customersCount,
    };
  }

  @Get('timeseries')
  @ApiOkResponse({ description: 'Time series of revenue/order count' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  async timeSeries(@Query() q: TimeSeriesDto) {
    const gran = q.granularity ?? 'day';
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;

    const whereClauses: Prisma.Sql[] = [];
    if (from) whereClauses.push(Prisma.sql`"createdAt" >= ${from}`);
    if (to) whereClauses.push(Prisma.sql`"createdAt" <= ${to}`);
    whereClauses.push(Prisma.sql`"status" IN ('PENDING','PROCESSING','OUT_FOR_DELIVERY','DELIVERED')`);

    // Build WHERE using SQL helpers
    const whereSql =
      whereClauses.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
        : Prisma.empty;

    // Safe date_trunc expression
    const granKey = gran === 'week' ? 'week' : gran === 'month' ? 'month' : 'day';
    const granSql = Prisma.sql`date_trunc(${Prisma.raw(`'${granKey}'`)}, "createdAt")`;

    const rows = await this.svc.prisma.$queryRaw<
      { bucket: Date; revenuecents: bigint; orders: bigint }[]
    >(Prisma.sql`
      SELECT ${granSql} AS bucket,
             SUM("totalCents") AS revenuecents,
             COUNT(*) AS orders
      FROM "Order"
      ${whereSql}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return rows.map((r) => ({
      period: r.bucket.toISOString(),
      revenueCents: Number(r.revenuecents ?? 0),
      orders: Number(r.orders ?? 0),
    }));
  }

  /**
   * TOP PRODUCTS: by quantity sold in range
   */
  @Get('top-products')
  @ApiOkResponse({ description: 'Top products by quantity' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async topProducts(@Query() range: RangeDto, @Query() lim: LimitDto) {
    const whereOrder: any = {};
    if (range.from || range.to) whereOrder.createdAt = {};
    if (range.from) whereOrder.createdAt.gte = new Date(range.from!);
    if (range.to) whereOrder.createdAt.lte = new Date(range.to!);
    whereOrder.status = { in: ['PENDING', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED'] as any };

    const topRaw = await this.svc.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { qty: true },
      where: { order: { ...(whereOrder.createdAt ? { createdAt: whereOrder.createdAt } : {}), status: whereOrder.status } },
      orderBy: { _sum: { qty: 'desc' } },
      take: lim.limit,
    });

    const products = await this.svc.prisma.product.findMany({
      where: { id: { in: topRaw.map((t) => t.productId) } },
      select: { id: true, name: true },
    });

    return topRaw.map((t) => ({
      productId: t.productId,
      qty: t._sum.qty ?? 0,
      name: products.find((p) => p.id === t.productId)?.name,
    }));
  }

  /**
   * LOW STOCK: configurable threshold
   */
  @Get('low-stock')
  @ApiOkResponse({ description: 'Products below threshold' })
  @ApiQuery({ name: 'threshold', required: false })
  async lowStock(@Query() thr: ThresholdDto) {
    return this.svc.prisma.product.findMany({
      where: { stock: { lt: thr.threshold ?? 10 }, status: 'ACTIVE' as any },
      select: { id: true, name: true, stock: true },
      orderBy: { stock: 'asc' },
    });
  }

  /**
   * STATUS BREAKDOWN: pie/bar data
   */
  @Get('status-breakdown')
  @ApiOkResponse({ description: 'Count of orders per status for the range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async statusBreakdown(@Query() range: RangeDto) {
    const where: any = {};
    if (range.from || range.to) where.createdAt = {};
    if (range.from) where.createdAt.gte = new Date(range.from!);
    if (range.to) where.createdAt.lte = new Date(range.to!);

    return this.svc.prisma.order.groupBy({
      by: ['status'],
      _count: { status: true },
      where: where.createdAt ? { createdAt: where.createdAt } : undefined,
    });
  }
}
