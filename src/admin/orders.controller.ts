import { Body, Controller, Get, Logger, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/order-status.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { AssignDriverDto } from '../delivery-drivers/dto/driver.dto';
import { ReceiptService } from '../orders/receipt.service';
import { OrderStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { OrdersService } from '../orders/orders.service';
import { AdminOrderListDto } from './dto/admin-order-list.dto';
import { DomainError, ErrorCode } from '../common/errors';
import { Throttle } from '@nestjs/throttler';
import { AutomationEventRef, AutomationEventsService } from '../automation/automation-events.service';

@ApiTags('Admin/Orders')
@ApiBearerAuth()
@StaffOrAdmin()
@Throttle({ default: { limit: 30, ttl: 60 } })
@Controller({ path: 'admin/orders', version: ['1'] })
export class AdminOrdersController {
  private readonly logger = new Logger(AdminOrdersController.name);

  constructor(
    private readonly svc: AdminService,
    private readonly receipts: ReceiptService,
    private readonly audit: AuditLogService,
    private readonly orders: OrdersService,
    private readonly automation: AutomationEventsService,
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
  async list(@Query() query: AdminOrderListDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) where.createdAt = {};
    if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = query.from;
    if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = query.to;
    if (query.customer) {
      where.user = {
        OR: [
          { name: { contains: query.customer, mode: 'insensitive' } },
          { phone: { contains: query.customer, mode: 'insensitive' } },
          { email: { contains: query.customer, mode: 'insensitive' } },
        ],
      };
    }
    if (query.minTotalCents !== undefined || query.maxTotalCents !== undefined) {
      where.totalCents = {};
      if (query.minTotalCents !== undefined) (where.totalCents as Prisma.IntFilter).gte = query.minTotalCents;
      if (query.maxTotalCents !== undefined) (where.totalCents as Prisma.IntFilter).lte = query.maxTotalCents;
    }
    if (query.driverId) {
      where.driverId = query.driverId;
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, fullName: true, phone: true } },
        },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.order.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
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
    const nextStatus = dto.to as OrderStatus;
    const result = await this.orders.updateStatus(id, nextStatus, user.userId, dto.note);
    this.logger.log({ msg: 'Order status updated', orderId: id, to: dto.to, actorId: user.userId });
    return result;
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
