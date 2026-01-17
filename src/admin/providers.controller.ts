import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { CreateProviderDto, ProviderListRequestDto, UpdateProviderDto } from './dto/provider.dto';

@ApiTags('Admin/Providers')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/providers', version: ['1'] })
export class AdminProvidersController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Paginated providers' })
  async list(@Query() query: ProviderListRequestDto) {
    const where: Prisma.ProviderWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.type) where.type = query.type as any;
    if (query.status) where.status = query.status as any;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.provider.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.provider.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const provider = await this.svc.prisma.provider.findUnique({
      where: { id },
      include: {
        branches: { select: { id: true, name: true, status: true, isDefault: true } },
      },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  @Post()
  async create(@Body() dto: CreateProviderDto) {
    const payload = await this.prepareProviderPayload(dto);
    if (!payload.slug) {
      payload.slug = await this.svc.slugs.generateUniqueSlug('provider', dto.slug ?? dto.name);
    }
    const created = await this.svc.prisma.provider.create({ data: payload as Prisma.ProviderCreateInput });
    await this.svc.audit.log({
      action: 'provider.create',
      entity: 'Provider',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProviderDto) {
    const existing = await this.svc.prisma.provider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');
    const payload = await this.prepareProviderPayload(dto, id);
    const updated = await this.svc.prisma.provider.update({
      where: { id },
      data: payload as Prisma.ProviderUpdateInput,
    });
    await this.svc.audit.log({
      action: 'provider.update',
      entity: 'Provider',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.svc.prisma.provider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');

    const activeOrders = await this.svc.prisma.order.count({
      where: {
        providerId: id,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY] },
      },
    });
    if (activeOrders > 0) {
      throw new BadRequestException('Provider has active orders and cannot be deleted');
    }

    const branches = await this.svc.prisma.branch.findMany({
      where: { providerId: id },
      select: { id: true },
    });
    const branchIds = branches.map((branch) => branch.id);
    const deletedAt = new Date();

    await this.svc.prisma.$transaction([
      this.svc.prisma.provider.update({
        where: { id },
        data: { status: 'DISABLED' },
      }),
      this.svc.prisma.branch.updateMany({
        where: { providerId: id },
        data: { status: 'INACTIVE', isDefault: false },
      }),
      this.svc.prisma.product.updateMany({
        where: { providerId: id, deletedAt: null },
        data: { deletedAt, status: 'DISCONTINUED' },
      }),
      this.svc.prisma.category.updateMany({
        where: { providerId: id, deletedAt: null },
        data: { deletedAt, isActive: false },
      }),
      this.svc.prisma.coupon.updateMany({
        where: { providerId: id },
        data: { isActive: false },
      }),
      this.svc.prisma.deliveryWindow.updateMany({
        where: { providerId: id },
        data: { isActive: false },
      }),
      this.svc.prisma.deliveryZone.updateMany({
        where: { providerId: id },
        data: { isActive: false },
      }),
      this.svc.prisma.providerDeliveryZonePricing.updateMany({
        where: { providerId: id },
        data: { isActive: false },
      }),
      ...(branchIds.length
        ? [
            this.svc.prisma.coupon.updateMany({
              where: { branchId: { in: branchIds } },
              data: { isActive: false },
            }),
            this.svc.prisma.deliveryWindow.updateMany({
              where: { branchId: { in: branchIds } },
              data: { isActive: false },
            }),
            this.svc.prisma.deliveryZone.updateMany({
              where: { branchId: { in: branchIds } },
              data: { isActive: false },
            }),
          ]
        : []),
    ]);

    await this.svc.audit.log({
      action: 'provider.delete',
      entity: 'Provider',
      entityId: id,
      before: existing,
      after: { status: 'DISABLED' },
    });
    return { ok: true };
  }

  private async prepareProviderPayload(dto: CreateProviderDto | UpdateProviderDto, id?: string) {
    const data: Record<string, any> = { ...dto };
    if (data.name) data.name = data.name.trim();
    if (data.slug) {
      data.slug = await this.svc.slugs.generateUniqueSlug('provider', data.slug, id);
    }
    if (
      (data.orderWindowStartMinutes !== undefined || data.orderWindowEndMinutes !== undefined) &&
      (data.orderWindowStartMinutes === undefined || data.orderWindowEndMinutes === undefined)
    ) {
      throw new BadRequestException('Ordering window start and end minutes must be provided together');
    }
    return data;
  }
}
