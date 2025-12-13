import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { AutomationEventStatus } from '@prisma/client';

class AutomationEventsQuery {
  status?: AutomationEventStatus;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
}

class AutomationReplayDto {
  status?: AutomationEventStatus;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

@ApiTags('Admin/Automation')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/automation', version: ['1'] })
export class AdminAutomationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEventsService,
  ) {}

  @Get('events')
  async list(@Query() query: AutomationEventsQuery) {
    const rawPageSize = query.pageSize ?? query.limit;
    const pageSize = Math.min(Math.max(Number(rawPageSize) || 20, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.from || query.to) where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.automationEvent.count({ where }),
    ]);
    const aggregates = await this.aggregateCounts();
    return { items, total, page, pageSize, aggregates };
  }

  @Post('replay')
  async replay(@Body() dto: AutomationReplayDto) {
    const where: any = {
      status: { in: [AutomationEventStatus.FAILED, AutomationEventStatus.DEAD] },
    };
    if (dto.status) where.status = dto.status;
    if (dto.type) where.type = dto.type;
    if (dto.from || dto.to) where.createdAt = {};
    if (dto.from) where.createdAt.gte = new Date(dto.from);
    if (dto.to) where.createdAt.lte = new Date(dto.to);
    const limit = Math.min(dto.limit ?? 50, 200);
    const events = await this.prisma.automationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    await this.prisma.automationEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { status: AutomationEventStatus.PENDING, nextAttemptAt: new Date(), lastError: null },
    });
    await this.automation.enqueueMany(events);
    return { success: true, replayed: events.length };
  }

  private async aggregateCounts() {
    const statuses = await this.prisma.automationEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return {
      pendingCount: statuses.find((s) => s.status === AutomationEventStatus.PENDING)?._count?._all ?? 0,
      failedCount: statuses.find((s) => s.status === AutomationEventStatus.FAILED)?._count?._all ?? 0,
      deadCount: statuses.find((s) => s.status === AutomationEventStatus.DEAD)?._count?._all ?? 0,
      sentCount: statuses.find((s) => s.status === AutomationEventStatus.SENT)?._count?._all ?? 0,
    };
  }
}
