import { Body, Controller, ForbiddenException, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { AdminOnly, ProviderOrStaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { OrderStatusNoteDto, UpdateOrderStatusDto } from './dto/order-status.dto';
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
@ProviderOrStaffOrAdmin()
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
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED', 'CANCELED'],
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'customer', required: false })
  @ApiQuery({ name: 'minTotalCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'maxTotalCents', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'hasDriver', required: false, type: Boolean })
  @ApiQuery({ name: 'orderGroupId', required: false })
  @ApiOkResponse({ description: 'Paginated orders with filters' })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: AdminOrderListDto) {
    const providerScope = await this.resolveProviderScope(user);
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) where.createdAt = {};
    if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = query.from;
    if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = query.to;
    if (query.customer) {
      const term = query.customer;
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { orderGroupId: { contains: term, mode: 'insensitive' } },
        { orderGroup: { is: { code: { contains: term, mode: 'insensitive' } } } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { phone: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { guestName: { contains: term, mode: 'insensitive' } },
        { guestPhone: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (query.minTotalCents !== undefined || query.maxTotalCents !== undefined) {
      where.totalCents = {};
      if (query.minTotalCents !== undefined) (where.totalCents as Prisma.IntFilter).gte = query.minTotalCents;
      if (query.maxTotalCents !== undefined) (where.totalCents as Prisma.IntFilter).lte = query.maxTotalCents;
    }
    if (query.driverId) {
      where.driverId = query.driverId;
    } else if (query.hasDriver !== undefined) {
      where.driverId = query.hasDriver ? { not: null } : null;
    }
    if (providerScope) {
      where.providerId = providerScope;
    } else if (query.providerId) {
      where.providerId = query.providerId;
    }
    if (query.orderGroupId) {
      where.orderGroupId = query.orderGroupId;
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
  async one(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerScope = await this.resolveProviderScope(user);
    const order = await this.svc.prisma.order.findFirst({
      where: { id, ...(providerScope ? { providerId: providerScope } : {}) },
      include: {
        items: { include: { options: true } },
        address: true,
        user: true,
        deliveryWindow: true,
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
    if (!order) {
      if (providerScope) {
        throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
      }
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    return order;
  }

  @Get(':id/history')
  async getHistory(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assertProviderOrderAccess(user, id);
    return this.orders.getAdminOrderHistory(id);
  }

  @Get(':id/transitions')
  async getTransitions(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assertProviderOrderAccess(user, id);
    const transitions = await this.orders.getOrderTransitions(id);
    if (user.role !== UserRole.PROVIDER) return transitions;
    const order = await this.svc.prisma.order.findFirst({
      where: { id, providerId: await this.resolveProviderScope(user) },
      select: { status: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
    }
    const blockedStatuses = new Set<OrderStatus>([OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]);
    const cancelableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING];
    const canCancel = cancelableStatuses.includes(order.status as OrderStatus) && !order.driverId;
    return transitions.filter((t) => {
      const target = t.to as OrderStatus;
      if (blockedStatuses.has(target)) return false;
      if (target === OrderStatus.CANCELED && !canCancel) return false;
      return true;
    });
  }

  @Get(':id/driver-location')
  async getDriverLocation(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assertProviderOrderAccess(user, id);
    return this.orders.getAdminOrderDriverLocation(id);
  }

  @Get(':id/receipt')
  async getReceipt(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assertProviderOrderAccess(user, id);
    return this.receipts.getForAdmin(id);
  }

  @Patch(':id/status')
  async updateStatus(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    await this.assertProviderOrderAccess(user, id);
    const nextStatus = dto.to as OrderStatus;
    await this.assertProviderStatusAllowed(user, id, nextStatus);
    const result = await this.orders.updateStatus(id, nextStatus, user.userId, dto.note);
    this.logger.log({ msg: 'Order status updated', orderId: id, to: dto.to, actorId: user.userId });
    return result;
  }

  @Post(':id/confirm')
  async confirm(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.CONFIRMED);
    const result = await this.orders.updateStatus(id, OrderStatus.CONFIRMED, user.userId, dto.note);
    this.logger.log({ msg: 'Order confirmed', orderId: id, actorId: user.userId });
    return result;
  }

  @Post(':id/prepare')
  async prepare(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.PREPARING);
    const result = await this.orders.updateStatus(id, OrderStatus.PREPARING, user.userId, dto.note);
    this.logger.log({ msg: 'Order preparing', orderId: id, actorId: user.userId });
    return result;
  }

  @Post(':id/out-for-delivery')
  async outForDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: OrderStatusNoteDto,
  ) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.OUT_FOR_DELIVERY);
    const result = await this.orders.updateStatus(id, OrderStatus.OUT_FOR_DELIVERY, user.userId, dto.note);
    this.logger.log({ msg: 'Order out for delivery', orderId: id, actorId: user.userId });
    return result;
  }

  @Post(':id/deliver')
  async deliver(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.DELIVERED);
    const result = await this.orders.updateStatus(id, OrderStatus.DELIVERED, user.userId, dto.note);
    this.logger.log({ msg: 'Order delivered', orderId: id, actorId: user.userId });
    return result;
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.CANCELED);
    const result = await this.orders.updateStatus(id, OrderStatus.CANCELED, user.userId, dto.note);
    this.logger.log({ msg: 'Order canceled', orderId: id, actorId: user.userId });
    return result;
  }

  @Patch(':id/assign-driver')
  async assignDriver(
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    if (admin.role === UserRole.PROVIDER) {
      throw new ForbiddenException('Provider accounts cannot assign drivers');
    }
    await this.assertProviderOrderAccess(admin, id);
    const result = await this.orders.assignDriverToOrder(id, dto.driverId, admin.userId);
    this.logger.log({ msg: 'Driver assigned', orderId: id, driverId: result.driver.id });
    return { success: true, data: result };
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.svc.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { status: true } } },
    });
    if (!membership) {
      throw new ForbiddenException('Provider account is not linked');
    }
    if (membership.provider.status !== ProviderStatus.ACTIVE) {
      throw new ForbiddenException('Provider account is not active');
    }
    return membership.providerId;
  }

  private async assertProviderOrderAccess(user: CurrentUserPayload, orderId: string) {
    const providerScope = await this.resolveProviderScope(user);
    if (!providerScope) return;
    const order = await this.svc.prisma.order.findFirst({
      where: { id: orderId, providerId: providerScope },
      select: { id: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
    }
  }

  private async assertProviderStatusAllowed(user: CurrentUserPayload, orderId: string, nextStatus: OrderStatus) {
    if (user.role !== UserRole.PROVIDER) return;
    const allowed = new Set<OrderStatus>([OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.CANCELED]);
    if (!allowed.has(nextStatus)) {
      throw new ForbiddenException('Provider accounts cannot update to this status');
    }
    if (nextStatus !== OrderStatus.CANCELED) return;
    const providerScope = await this.resolveProviderScope(user);
    if (!providerScope) return;
    const order = await this.svc.prisma.order.findFirst({
      where: { id: orderId, providerId: providerScope },
      select: { status: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
    }
    const status = order.status as OrderStatus;
    const cancelBlockedStatuses: OrderStatus[] = [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
    if (cancelBlockedStatuses.includes(status)) {
      throw new ForbiddenException('Provider accounts cannot cancel after driver pickup');
    }
    if (order.driverId) {
      throw new ForbiddenException('Provider accounts cannot cancel once a driver is assigned');
    }
  }
}
