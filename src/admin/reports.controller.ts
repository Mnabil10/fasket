import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOrAdmin } from './_admin-guards';
import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';

interface DateRange {
  from: Date;
  to: Date;
}

@ApiTags('Admin/Reports')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/reports', version: ['1'] })
export class AdminReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('profit/daily')
  async daily(@Query('date') date: string) {
    const target = date ? new Date(date) : new Date();
    const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.computeRange({ from: start, to: end });
  }

  @Get('profit/range')
  async range(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) {
      throw new BadRequestException('from and to are required');
    }
    const start = new Date(from);
    const end = new Date(to);
    return this.computeRange({ from: start, to: end });
  }

  @Get('profit/export')
  async export(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format = 'csv',
    @Res() res: Response,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to are required');
    }
    if (format && format.toLowerCase() !== 'csv') {
      throw new BadRequestException('Only CSV export is supported');
    }
    const maxRangeDays = Number(process.env.PROFIT_EXPORT_MAX_DAYS ?? 90);
    const startDate = new Date(from);
    const endDate = new Date(to);
    const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxRangeDays) {
      throw new BadRequestException(`Date range too large. Max ${maxRangeDays} days`);
    }
    format = 'csv';
    const start = startDate;
    const end = endDate;
    const data = await this.computeRange({ from: start, to: end });
    const rows = [
      ['date', 'orders', 'salesCents', 'discountCents', 'deliveryFeeCents', 'netRevenueCents', 'cogsCents', 'grossProfitCents', 'grossMarginPct', 'missingCostCount'],
      [
        data.date,
        data.ordersCount,
        data.salesCents,
        data.discountCents,
        data.deliveryFeeCents,
        data.netRevenueCents,
        data.cogsCents,
        data.grossProfitCents,
        data.grossMarginPct,
        data.missingCostCount,
      ],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    const filename = `profit_${from}_${to}.${ext}`;
    res.setHeader(
      'Content-Type',
      ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  private async computeRange(window: DateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: window.from, lt: window.to },
        status: { not: 'CANCELED' as any },
      },
      select: {
        id: true,
        discountCents: true,
        loyaltyDiscountCents: true,
        shippingFeeCents: true,
        items: {
          select: {
            qty: true,
            unitPriceCents: true,
            unitCostCents: true,
            priceSnapshotCents: true,
            lineTotalCents: true,
          },
        },
      },
    });

    let salesCents = 0;
    let discountCents = 0;
    let deliveryFeeCents = 0;
    let cogsCents = 0;
    let missingCostCount = 0;
    for (const order of orders) {
      let itemsTotal = 0;
      let itemsCost = 0;
      for (const item of order.items) {
        const unitPrice = item.unitPriceCents || item.priceSnapshotCents || 0;
        const lineTotal = item.lineTotalCents || unitPrice * item.qty;
        const cost = item.unitCostCents || 0;
        if (!item.unitCostCents || item.unitCostCents <= 0) {
          missingCostCount += 1;
        }
        itemsTotal += lineTotal;
        itemsCost += cost * item.qty;
      }
      salesCents += itemsTotal;
      discountCents += (order.discountCents ?? 0) + (order.loyaltyDiscountCents ?? 0);
      deliveryFeeCents += order.shippingFeeCents ?? 0;
      cogsCents += itemsCost;
    }
    const netRevenueCents = Math.max(0, salesCents - discountCents) + deliveryFeeCents;
    const grossProfitCents = netRevenueCents - cogsCents;
    const grossMarginPct = netRevenueCents > 0 ? (grossProfitCents / netRevenueCents) * 100 : 0;
    return {
      date: window.from.toISOString().slice(0, 10),
      ordersCount: orders.length,
      salesCents,
      discountCents,
      deliveryFeeCents,
      netRevenueCents,
      cogsCents,
      grossProfitCents,
      grossMarginPct: Number(grossMarginPct.toFixed(2)),
      missingCostCount,
    };
  }
}
