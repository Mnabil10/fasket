import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { CreatePlanDto, PlanListRequestDto, UpdatePlanDto } from './dto/plan.dto';

@ApiTags('Admin/Plans')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/plans', version: ['1'] })
export class AdminPlansController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'billingInterval', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiOkResponse({ description: 'Paginated plans' })
  async list(@Query() query: PlanListRequestDto) {
    const where: Prisma.PlanWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.billingInterval) where.billingInterval = query.billingInterval as any;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.plan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.plan.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.svc.prisma.plan.findUnique({ where: { id } });
  }

  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const payload: Prisma.PlanCreateInput = {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      billingInterval: dto.billingInterval as any,
      amountCents: dto.amountCents ?? 0,
      currency: dto.currency ?? 'EGP',
      commissionRateBps: dto.commissionRateBps ?? 0,
      trialDays: dto.trialDays ?? 0,
      isActive: dto.isActive ?? true,
    };
    const created = await this.svc.prisma.plan.create({ data: payload });
    await this.svc.audit.log({
      action: 'plan.create',
      entity: 'Plan',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const existing = await this.svc.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plan not found');
    const payload: Prisma.PlanUpdateInput = {
      ...dto,
      amountCents: dto.amountCents,
      commissionRateBps: dto.commissionRateBps,
      trialDays: dto.trialDays,
    };
    const updated = await this.svc.prisma.plan.update({ where: { id }, data: payload });
    await this.svc.audit.log({
      action: 'plan.update',
      entity: 'Plan',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }
}
