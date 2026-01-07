import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LedgerEntryType, PayoutStatus, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { PayoutsService } from './payouts.service';
import {
  CommissionConfigListDto,
  CreateCommissionConfigDto,
  CreatePayoutDto,
  FinanceBalanceListDto,
  FinanceLedgerListDto,
  FinancePayoutListDto,
  UpdateCommissionConfigDto,
  UpdatePayoutDto,
} from './dto/finance.dto';
import { DomainError, ErrorCode } from '../common/errors';

@ApiTags('Admin/Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'FINANCE')
@Controller({ path: 'admin/finance', version: ['1'] })
export class AdminFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get('summary')
  async summary() {
    const [financials, payoutsPending, unsettledOrders] = await this.prisma.$transaction([
      this.prisma.orderFinancials.aggregate({
        _sum: { platformRevenueCents: true, commissionCents: true },
      }),
      this.prisma.payout.count({ where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } } }),
      this.prisma.order.count({
        where: {
          status: 'DELIVERED',
          financials: null,
        },
      }),
    ]);

    const balancesAgg = await this.prisma.vendorBalance.aggregate({
      _sum: { availableCents: true, pendingCents: true },
    });

    return {
      platformRevenueCents: financials._sum.platformRevenueCents ?? 0,
      totalCommissionCents: financials._sum.commissionCents ?? 0,
      payoutQueueCount: payoutsPending,
      unsettledOrdersCount: unsettledOrders,
      totalAvailableCents: balancesAgg._sum.availableCents ?? 0,
      totalPendingCents: balancesAgg._sum.pendingCents ?? 0,
    };
  }

  @Get('balances')
  async listBalances(@Query() query: FinanceBalanceListDto) {
    const where: Prisma.VendorBalanceWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.minAvailableCents !== undefined) {
      where.availableCents = { gte: query.minAvailableCents };
    }
    if (query.from || query.to) {
      where.updatedAt = {};
      if (query.from) (where.updatedAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.updatedAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vendorBalance.findMany({
        where,
        include: { provider: { select: { id: true, name: true, status: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.vendorBalance.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get('ledger')
  async listLedger(@Query() query: FinanceLedgerListDto) {
    const where: Prisma.TransactionLedgerWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transactionLedger.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true } },
          order: { select: { id: true, code: true } },
          payout: { select: { id: true, status: true, referenceId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.transactionLedger.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get('payouts')
  async listPayouts(@Query() query: FinancePayoutListDto) {
    const where: Prisma.PayoutWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        include: { provider: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.payout.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post('payouts')
  async createPayout(@Body() dto: CreatePayoutDto) {
    return this.payouts.createPayout({
      providerId: dto.providerId,
      amountCents: dto.amountCents,
      feeCents: dto.feeCents ?? 0,
      referenceId: dto.referenceId ?? null,
    });
  }

  @Post('payouts/run-scheduled')
  async runScheduledPayouts() {
    return this.payouts.runScheduledPayouts();
  }

  @Patch('payouts/:id')
  async updatePayout(@Param('id') id: string, @Body() dto: UpdatePayoutDto) {
    return this.payouts.updatePayoutStatus(id, {
      status: dto.status,
      referenceId: dto.referenceId ?? null,
      failureReason: dto.failureReason ?? null,
    });
  }

  @Get('commission-configs')
  async listCommissionConfigs(@Query() query: CommissionConfigListDto) {
    const where: Prisma.CommissionConfigWhereInput = {};
    if (query.scope) where.scope = query.scope;
    if (query.providerId) where.providerId = query.providerId;
    if (query.categoryId) where.categoryId = query.categoryId;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commissionConfig.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.commissionConfig.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post('commission-configs')
  async createCommissionConfig(@Body() dto: CreateCommissionConfigDto) {
    if (dto.scope !== 'PLATFORM' && !dto.providerId && !dto.categoryId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Provider or category scope required', 400);
    }
    return this.prisma.commissionConfig.create({ data: dto as Prisma.CommissionConfigCreateInput });
  }

  @Patch('commission-configs/:id')
  async updateCommissionConfig(@Param('id') id: string, @Body() dto: UpdateCommissionConfigDto) {
    return this.prisma.commissionConfig.update({
      where: { id },
      data: dto as Prisma.CommissionConfigUpdateInput,
    });
  }

  @Get('statements/:providerId')
  async statement(@Param('providerId') providerId: string, @Query() query: FinanceLedgerListDto) {
    const result = await this.finance.listLedgerEntries(providerId, query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get('statements/:providerId/csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=\"statement.csv\"')
  async statementCsv(@Param('providerId') providerId: string, @Query() query: FinanceLedgerListDto) {
    const result = await this.finance.listLedgerEntries(providerId, query);
    return this.toCsv(result.items);
  }

  @Get('unsettled-orders')
  async unsettledOrders(@Query() query: FinanceLedgerListDto) {
    const where: Prisma.OrderWhereInput = {
      status: 'DELIVERED',
      financials: null,
    };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: { id: true, code: true, providerId: true, totalCents: true, createdAt: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private toCsv(items: Array<{ createdAt: Date; type: LedgerEntryType; orderId?: string | null; payoutId?: string | null; amountCents: number; currency?: string | null }>) {
    const header = ['date', 'type', 'orderId', 'payoutId', 'amountCents', 'currency'];
    const rows = items.map((entry) => [
      entry.createdAt.toISOString(),
      entry.type,
      entry.orderId ?? '',
      entry.payoutId ?? '',
      String(entry.amountCents),
      entry.currency ?? 'EGP',
    ]);
    const lines = [header, ...rows].map((row) => row.map((cell) => this.escapeCsv(cell)).join(','));
    return lines.join('\n');
  }

  private escapeCsv(value: string) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/\"/g, '""')}"`;
    }
    return value;
  }
}
