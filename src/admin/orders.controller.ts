import { Body, Controller, Get, Logger, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { AssignDriverDto } from '../delivery-drivers/dto/driver.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptService } from '../orders/receipt.service';
import { OrderStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { OrdersService } from '../orders/orders.service';

@ApiTags('Admin/Orders')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/orders', version: ['1'] })
export class AdminOrdersController {
  private readonly logger = new Logger(AdminOrdersController.name);

  constructor(
    private readonly svc: AdminService,
    private readonly notifications: NotificationsService,
    private readonly receipts: ReceiptService,
    private readonly audit: AuditLogService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING','PROCESSING','OUT_FOR_DELIVERY','DELIVERED','CANCELED'] })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'customer', required: false })
  @ApiQuery({ name: 'minTotalCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxTotalCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiOkResponse({ description: 'Paginated orders with filters' })
  async list(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customer') customer?: string,
    @Query('minTotalCents') minTotalCents?: string,
    @Query('maxTotalCents') maxTotalCents?: string,
    @Query('driverId') driverId?: string,
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
    if (driverId) {
      where.driverId = driverId;
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, fullName: true, phone: true } },
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
      include: {
        items: true,
        address: true,
        user: true,
        statusHistory: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            vehicle: { select: { type: true, plateNumber: true } },
          },
        },
      },
    });
  }

  @Get(':id/receipt')
  getReceipt(@Param('id') id: string) {
    return this.receipts.getForAdmin(id);
  }

  @Patch(':id/status')
  async updateStatus(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const before = await this.svc.prisma.order.findUnique({ where: { id } });
    if (!before) {
      return { ok: false, message: 'Order not found' };
    }

    const nextStatus = dto.to as OrderStatus;
    let loyaltyEarned = 0;
    await this.svc.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: nextStatus } });
      await tx.orderStatusHistory.create({
        data: { orderId: id, from: before.status as any, to: nextStatus as any, note: dto.note, actorId: user.userId },
      });
      if (nextStatus === OrderStatus.DELIVERED) {
        loyaltyEarned = await this.orders.awardLoyaltyForOrder(id, tx);
      }
    });

    const statusKey =
      nextStatus === OrderStatus.OUT_FOR_DELIVERY
        ? 'order_out_for_delivery'
        : nextStatus === OrderStatus.DELIVERED
          ? 'order_delivered'
          : nextStatus === OrderStatus.CANCELED
            ? 'order_canceled'
            : 'order_status_changed';
    await this.notifications.notify(statusKey, before.userId, { orderId: id, status: nextStatus });
    if (loyaltyEarned > 0) {
      await this.notifications.notify('loyalty_earned', before.userId, { orderId: id, points: loyaltyEarned });
    }
    await this.audit.log({
      action: 'order.status.change',
      entity: 'order',
      entityId: id,
      before: { status: before.status },
      after: { status: nextStatus, note: dto.note },
    });
    this.logger.log({ msg: 'Order status updated', orderId: id, from: before.status, to: dto.to, actorId: user.userId });
    return { ok: true };
  }

  @Patch(':id/assign-driver')
  async assignDriver(
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    const result = await this.orders.assignDriverToOrder(id, dto.driverId, admin.userId);
    this.logger.log({ msg: 'Driver assigned', orderId: id, driverId: result.driver.id });
    return { success: true, data: result };
  }
}
