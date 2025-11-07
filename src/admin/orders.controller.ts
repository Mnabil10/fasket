import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin/Orders')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING','PROCESSING','OUT_FOR_DELIVERY','DELIVERED','CANCELED'] })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'customer', required: false })
  @ApiQuery({ name: 'minTotalCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxTotalCents', required: false, schema: { type: 'integer' } })
  @ApiOkResponse({ description: 'Paginated orders with filters' })
  async list(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customer') customer?: string,
    @Query('minTotalCents') minTotalCents?: string,
    @Query('maxTotalCents') maxTotalCents?: string,
    @Query() page?: PaginationDto,
  ) {
    const where: any = {};
    if (status) where.status = status as any;
    if (from || to) where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
    if (customer) {
      where.user = {
        OR: [
          { name: { contains: customer, mode: 'insensitive' } },
          { phone: { contains: customer, mode: 'insensitive' } },
          { email: { contains: customer, mode: 'insensitive' } },
        ],
      };
    }
    if (minTotalCents || maxTotalCents) {
      where.totalCents = {};
      if (minTotalCents) where.totalCents.gte = Number(minTotalCents);
      if (maxTotalCents) where.totalCents.lte = Number(maxTotalCents);
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
        skip: page?.skip, take: page?.take,
      }),
      this.svc.prisma.order.count({ where }),
    ]);

    return { items, total, page: page?.page, pageSize: page?.pageSize };
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.svc.prisma.order.findUnique({
      where: { id },
      include: { items: true, address: true, user: true, statusHistory: true },
    });
  }

  @Patch(':id/status')
  async updateStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const before = await this.svc.prisma.order.findUnique({ where: { id } });
    if (!before) return { ok: false, message: 'Order not found' };

    await this.svc.prisma.$transaction(async tx => {
      await tx.order.update({ where: { id }, data: { status: dto.to as any } });
      await tx.orderStatusHistory.create({
        data: { orderId: id, from: before.status as any, to: dto.to as any, note: dto.note, actorId: user.userId },
      });
    });
    return { ok: true };
  }
}
