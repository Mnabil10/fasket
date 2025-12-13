import { Body, Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { AutomationEventStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Param } from '@nestjs/common';

class AutomationEventsQuery {
  @ApiPropertyOptional({ enum: AutomationEventStatus })
  @IsOptional()
  @IsEnum(AutomationEventStatus)
  status?: AutomationEventStatus;

  @ApiPropertyOptional({ description: 'Automation event type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'ISO date string (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date string (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size; alias: limit', default: 20, minimum: 1, maximum: 200 })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Alias for pageSize', minimum: 1, maximum: 200 })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search in correlationId, order code, phone or dedupe' })
  @IsOptional()
  @IsString()
  q?: string;
}

class AutomationReplayDto {
  @ApiPropertyOptional({ enum: AutomationEventStatus, description: 'Defaults to FAILED/DEAD when omitted' })
  @IsOptional()
  @IsEnum(AutomationEventStatus)
  status?: AutomationEventStatus;

  @ApiPropertyOptional({ description: 'Automation event type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'ISO date string (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date string (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
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
    if (query.q) {
      const term = query.q.trim();
      where.OR = [
        { correlationId: { contains: term, mode: 'insensitive' } },
        { dedupeKey: { contains: term, mode: 'insensitive' } },
        { payload: { path: ['order_code'], string_contains: term } },
        { payload: { path: ['order_id'], string_contains: term } },
        { payload: { path: ['customer_phone'], string_contains: term } },
        { payload: { path: ['phone'], string_contains: term } },
      ];
    }
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
    return { items, total, page, pageSize, aggregates, counts: aggregates };
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

  @Post('events/:id/replay')
  async replaySingle(@Param('id') id: string) {
    const event = await this.prisma.automationEvent.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!event) {
      return { success: false, message: 'Event not found' };
    }
    const nextAttemptAt = new Date();
    await this.prisma.automationEvent.update({
      where: { id },
      data: { status: AutomationEventStatus.PENDING, nextAttemptAt, lastError: null },
    });
    await this.automation.enqueue(id, nextAttemptAt);
    return { success: true, id };
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
