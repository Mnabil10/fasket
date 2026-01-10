import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { FinanceLedgerListDto } from './dto/finance.dto';
import { ProviderNotificationPreferencesDto } from './dto/provider-preferences.dto';

const DEFAULT_PREFS = {
  newOrders: { email: true, sms: true, push: true, whatsapp: true },
  payoutSuccess: { email: true, sms: false, push: true, whatsapp: false },
  subscriptionExpiry: { email: true, sms: false, push: true, whatsapp: false },
  invoiceUpdates: { email: true, sms: false, push: true, whatsapp: true },
};

@ApiTags('Provider/Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider', version: ['1'] })
export class ProviderFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: CurrentUserPayload) {
    const providerId = await this.resolveProviderId(user.userId);
    return this.finance.getProviderDashboard(providerId);
  }

  @Get('earnings/summary')
  async earningsSummary(@CurrentUser() user: CurrentUserPayload, @Query() range: { from?: string; to?: string }) {
    const providerId = await this.resolveProviderId(user.userId);
    return this.finance.getProviderEarnings(providerId, range);
  }

  @Get('earnings/statement')
  async statement(@CurrentUser() user: CurrentUserPayload, @Query() query: FinanceLedgerListDto) {
    const providerId = await this.resolveProviderId(user.userId);
    const result = await this.finance.listLedgerEntries(providerId, query);
    return { items: result.items, total: result.total, page: query.page, pageSize: query.pageSize };
  }

  @Get('earnings/statement/csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=\"statement.csv\"')
  async statementCsv(@CurrentUser() user: CurrentUserPayload, @Query() query: FinanceLedgerListDto) {
    const providerId = await this.resolveProviderId(user.userId);
    const result = await this.finance.listLedgerEntries(providerId, query);
    const header = ['date', 'type', 'orderId', 'payoutId', 'amountCents', 'currency'];
    const rows = result.items.map((entry) => [
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

  @Get('payouts')
  async payouts(@CurrentUser() user: CurrentUserPayload, @Query() query: FinanceLedgerListDto) {
    const providerId = await this.resolveProviderId(user.userId);
    const where: Prisma.PayoutWhereInput = { providerId };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.payout.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get('notification-preferences')
  async getPreferences(@CurrentUser() user: CurrentUserPayload) {
    const providerId = await this.resolveProviderId(user.userId);
    const existing = await this.prisma.providerNotificationPreference.findUnique({
      where: { providerId },
    });
    if (!existing) {
      const created = await this.prisma.providerNotificationPreference.create({
        data: { providerId, preferences: DEFAULT_PREFS },
      });
      return created.preferences;
    }
    return this.mergePreferences(existing.preferences);
  }

  @Patch('notification-preferences')
  async updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ProviderNotificationPreferencesDto,
  ) {
    const providerId = await this.resolveProviderId(user.userId);
    const existing = await this.prisma.providerNotificationPreference.findUnique({
      where: { providerId },
    });
    const next = this.mergePreferences(dto, existing?.preferences ?? DEFAULT_PREFS);
    const updated = await this.prisma.providerNotificationPreference.upsert({
      where: { providerId },
      update: { preferences: next },
      create: { providerId, preferences: next },
    });
    return updated.preferences;
  }

  private async resolveProviderId(userId: string) {
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId },
      include: { provider: { select: { id: true, status: true } } },
    });
    if (!membership?.provider) {
      throw new NotFoundException('Provider not found');
    }
    if (membership.provider.status !== 'ACTIVE') {
      throw new NotFoundException('Provider not active');
    }
    return membership.provider.id;
  }

  private mergePreferences(
    input?: ProviderNotificationPreferencesDto | Record<string, any> | Prisma.JsonValue,
    base: Record<string, any> | Prisma.JsonValue = DEFAULT_PREFS,
  ) {
    const normalizedBase =
      base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, any>) : DEFAULT_PREFS;
    const data: Record<string, any> = { ...normalizedBase };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return data;
    const typed = input as Record<string, any>;
    for (const key of Object.keys(DEFAULT_PREFS)) {
      const channel = typed[key] ?? {};
      data[key] = {
        email: channel.email ?? data[key].email,
        sms: channel.sms ?? data[key].sms,
        push: channel.push ?? data[key].push,
        whatsapp: channel.whatsapp ?? data[key].whatsapp,
      };
    }
    return data;
  }

  private escapeCsv(value: string) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/\"/g, '""')}"`;
    }
    return value;
  }
}
