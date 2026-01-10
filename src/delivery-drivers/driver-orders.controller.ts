import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { DriverLocationDto } from './dto/driver-location.dto';
import {
  DriverOrderActionDto,
  DriverOrderFailureDto,
  DriverOrderListDto,
  DriverOrderStatusDto,
} from './dto/driver-orders.dto';
import { DeliveryDriversService } from './delivery-drivers.service';
import { DomainError, ErrorCode } from '../common/errors';

@ApiTags('Driver/Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
@Controller({ path: 'driver/orders', version: ['1'] })
export class DriverOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly drivers: DeliveryDriversService,
  ) {}

  @Get()
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED', 'CANCELED'],
  })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: DriverOrderListDto) {
    const driver = await this.getDriverProfile(user.userId);
    const where: Prisma.OrderWhereInput = { driverId: driver.id };
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELED, OrderStatus.DELIVERY_FAILED] };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          address: true,
          items: { select: { id: true, productNameSnapshot: true, qty: true } },
        },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((order) => this.mapDriverOrder(order)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get(':id')
  async detail(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const driver = await this.getDriverProfile(user.userId);
    const order = await this.prisma.order.findFirst({
      where: { id, driverId: driver.id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        address: true,
        items: { select: { id: true, productNameSnapshot: true, qty: true, priceSnapshotCents: true } },
      },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 404);
    }
    return this.mapDriverOrder(order, { includeItems: true });
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DriverOrderStatusDto,
  ) {
    const driver = await this.getDriverProfile(user.userId);
    await this.getAssignedOrder(id, driver.id);
    const allowedStatuses: OrderStatus[] = [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
    if (!allowedStatuses.includes(dto.to)) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Drivers can only update delivery statuses', 400);
    }
    return this.orders.updateStatus(id, dto.to, user.userId, dto.note);
  }

  @Post(':id/start-delivery')
  async startDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DriverOrderActionDto,
  ) {
    const driver = await this.getDriverProfile(user.userId);
    await this.getAssignedOrder(id, driver.id);
    return this.orders.updateStatus(id, OrderStatus.OUT_FOR_DELIVERY, user.userId, dto.note);
  }

  @Post(':id/complete')
  async completeDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DriverOrderActionDto,
  ) {
    const driver = await this.getDriverProfile(user.userId);
    await this.getAssignedOrder(id, driver.id);
    return this.orders.updateStatus(id, OrderStatus.DELIVERED, user.userId, dto.note);
  }

  @Post(':id/fail')
  async failDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DriverOrderFailureDto,
  ) {
    const driver = await this.getDriverProfile(user.userId);
    await this.getAssignedOrder(id, driver.id);
    const note = dto.note ?? dto.reason;
    return this.orders.updateStatus(id, OrderStatus.DELIVERY_FAILED, user.userId, note, {
      deliveryFailedReason: dto.reason,
      deliveryFailedNote: dto.note ?? null,
    });
  }

  @Post(':id/location')
  async recordLocation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DriverLocationDto,
  ) {
    const driver = await this.getDriverProfile(user.userId);
    return this.drivers.recordLocation(driver.id, { ...dto, orderId: id });
  }

  private async getDriverProfile(userId: string) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { userId },
      select: { id: true, isActive: true, fullName: true, phone: true },
    });
    if (!driver) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver account not linked', 403);
    }
    if (!driver.isActive) {
      throw new DomainError(ErrorCode.DRIVER_INACTIVE, 'Driver account is inactive', 403);
    }
    return driver;
  }

  private async getAssignedOrder(orderId: string, driverId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, driverId },
      select: { id: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_UNAUTHORIZED, 'Order not found', 403);
    }
    return order;
  }

  private mapDriverOrder(order: any, options: { includeItems?: boolean } = {}) {
    const guestAddress = order.guestAddress as Record<string, any> | null | undefined;
    const address = order.address
      ? {
          label: order.address.label ?? null,
          city: order.address.city ?? null,
          street: order.address.street ?? null,
          building: order.address.building ?? null,
          apartment: order.address.apartment ?? null,
          notes: order.address.notes ?? null,
          lat: order.address.lat ?? null,
          lng: order.address.lng ?? null,
        }
      : guestAddress
        ? {
            label: guestAddress.fullAddress ?? guestAddress.street ?? null,
            city: guestAddress.city ?? guestAddress.region ?? null,
            street: guestAddress.street ?? guestAddress.fullAddress ?? null,
            building: guestAddress.building ?? null,
            apartment: guestAddress.apartment ?? null,
            notes: guestAddress.notes ?? null,
            lat: order.guestLat ?? guestAddress.lat ?? null,
            lng: order.guestLng ?? guestAddress.lng ?? null,
          }
        : null;

    return {
      id: order.id,
      code: order.code ?? order.id,
      status: order.status,
      createdAt: order.createdAt,
      totalCents: order.totalCents,
      paymentMethod: order.paymentMethod,
      customer: order.user
        ? { id: order.user.id, name: order.user.name, phone: order.user.phone }
        : { id: order.id, name: order.guestName ?? 'Guest', phone: order.guestPhone ?? '' },
      address,
      items: options.includeItems
        ? (order.items ?? []).map((item: any) => ({
            id: item.id,
            name: item.productNameSnapshot,
            qty: item.qty,
            priceSnapshotCents: item.priceSnapshotCents,
          }))
        : undefined,
    };
  }
}
