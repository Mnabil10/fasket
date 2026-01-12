import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { OrdersService } from './orders.service';
import { ReceiptService } from './receipt.service';
import { AdminOrderListDto } from '../admin/dto/admin-order-list.dto';
import { OrderStatusNoteDto, UpdateOrderStatusDto } from '../admin/dto/order-status.dto';
import { DomainError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Provider/Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/orders', version: ['1'] })
export class ProviderOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly receipts: ReceiptService,
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
  @ApiQuery({ name: 'orderGroupId', required: false })
  @ApiOkResponse({ description: 'Paginated orders with filters' })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: AdminOrderListDto) {
    const providerId = await this.resolveProviderScope(user);
    const where: Prisma.OrderWhereInput = { providerId };
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
    if (query.orderGroupId) {
      where.orderGroupId = query.orderGroupId;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, fullName: true, phone: true } },
        },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerId = await this.resolveProviderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id, providerId },
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
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
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
    const order = await this.prisma.order.findFirst({
      where: { id, providerId: await this.resolveProviderScope(user) },
      select: { status: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
    }
    const blocked = new Set<OrderStatus>([OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]);
    const cancelableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING];
    const canCancel = cancelableStatuses.includes(order.status as OrderStatus) && !order.driverId;
    return transitions.filter((t) => {
      const target = t.to as OrderStatus;
      if (blocked.has(target)) return false;
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
    return this.orders.updateStatus(id, nextStatus, user.userId, dto.note);
  }

  @Post(':id/confirm')
  async confirm(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.CONFIRMED);
    return this.orders.updateStatus(id, OrderStatus.CONFIRMED, user.userId, dto.note);
  }

  @Post(':id/prepare')
  async prepare(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.PREPARING);
    return this.orders.updateStatus(id, OrderStatus.PREPARING, user.userId, dto.note);
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OrderStatusNoteDto) {
    await this.assertProviderOrderAccess(user, id);
    await this.assertProviderStatusAllowed(user, id, OrderStatus.CANCELED);
    return this.orders.updateStatus(id, OrderStatus.CANCELED, user.userId, dto.note);
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.prisma.providerUser.findFirst({
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
    const providerId = await this.resolveProviderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, providerId },
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
    const providerId = await this.resolveProviderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, providerId },
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
