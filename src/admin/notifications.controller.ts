import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { StaffOrAdmin } from './_admin-guards';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import {
  AdminNotificationCreateDto,
  AdminNotificationListDto,
  NotificationLogQueryDto,
  NotificationTargetDto,
  WebPushSubscriptionDto,
} from './dto/notifications.dto';
import { NotificationTarget } from '../notifications/notifications.types';
import { ConfigService } from '@nestjs/config';

@ApiTags('Admin/Notifications')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/notifications', version: ['1'] })
export class AdminNotificationsController {
  constructor(
    private readonly svc: AdminService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.config.get<string>('WEB_PUSH_PUBLIC_KEY') ?? '' };
  }

  @Get()
  @ApiOkResponse({ description: 'Paginated notifications list' })
  async list(@Query() query: AdminNotificationListDto) {
    const where: Prisma.NotificationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      const term = query.q.trim();
      if (term) {
        where.OR = [
          { title: { contains: term, mode: 'insensitive' } },
          { body: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.notification.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id/logs')
  @ApiOkResponse({ description: 'Notification delivery logs' })
  async logs(@Param('id') id: string, @Query() query: NotificationLogQueryDto) {
    const where: Prisma.NotificationLogWhereInput = { notificationId: id };
    if (query.status) where.status = query.status;
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          device: { select: { platform: true } },
          user: { select: { id: true, name: true, phone: true, email: true } },
        },
      }),
      this.svc.prisma.notificationLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post()
  @ApiOkResponse({ description: 'Create admin notification' })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: AdminNotificationCreateDto) {
    const target = await this.toTarget(dto.target);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    return this.notifications.createAdminNotification({
      title: dto.title.trim(),
      body: dto.body.trim(),
      imageUrl: dto.imageUrl ?? null,
      type: dto.type ?? null,
      target,
      scheduledAt,
      createdById: user.userId,
      channel: dto.channel,
      priority: dto.priority,
      sound: dto.sound ?? null,
      sendNow: dto.sendNow,
    });
  }

  @Post(':id/send')
  @ApiOkResponse({ description: 'Send notification immediately' })
  sendNow(@Param('id') id: string) {
    return this.notifications.sendAdminNotificationNow(id);
  }

  @Post('subscribe')
  @ApiOkResponse({ description: 'Register admin web push subscription' })
  subscribe(@CurrentUser() user: CurrentUserPayload, @Body() dto: WebPushSubscriptionDto) {
    return this.notifications.registerWebSubscription(user.userId, user.role, {
      endpoint: dto.endpoint,
      keys: dto.keys,
      userAgent: dto.userAgent ?? null,
    });
  }

  @Post('unsubscribe')
  @ApiOkResponse({ description: 'Remove admin web push subscription' })
  unsubscribe(@CurrentUser() user: CurrentUserPayload, @Body() dto: { endpoint: string }) {
    if (!dto?.endpoint) {
      throw new BadRequestException('endpoint is required');
    }
    return this.notifications.unregisterWebSubscription(user.userId, dto.endpoint);
  }

  private async toTarget(input: NotificationTargetDto): Promise<NotificationTarget> {
    if (input.type === 'all') {
      return { type: 'broadcast' };
    }
    if (input.type === 'customers_with_coupons') {
      return { type: 'customers_with_coupons' };
    }
    if (input.type === 'coupon_users') {
      const couponCode = String(input.couponCode ?? '').trim();
      const couponId = String(input.couponId ?? '').trim();
      if (!couponCode && !couponId) {
        throw new BadRequestException('couponCode or couponId is required for coupon_users targets');
      }
      const coupon = couponId
        ? await this.svc.prisma.coupon.findUnique({ where: { id: couponId }, select: { id: true, code: true } })
        : await this.svc.prisma.coupon.findFirst({ where: { code: couponCode }, select: { id: true, code: true } });
      if (!coupon) {
        throw new BadRequestException('Coupon not found');
      }
      return { type: 'coupon_users', couponId: coupon.id, couponCode: coupon.code };
    }
    if (input.type === 'provider_customers') {
      if (!input.providerId) {
        throw new BadRequestException('providerId is required for provider_customers targets');
      }
      return { type: 'provider_customers', providerId: input.providerId };
    }
    if (input.type === 'recent_customers') {
      const days = Number.isFinite(Number(input.days)) ? Math.trunc(Number(input.days)) : 7;
      if (days <= 0) {
        throw new BadRequestException('days must be greater than zero for recent_customers targets');
      }
      return { type: 'recent_customers', days };
    }
    if (input.type === 'minimum_orders') {
      const minOrders = Number.isFinite(Number(input.minOrders)) ? Math.trunc(Number(input.minOrders)) : 1;
      if (minOrders <= 0) {
        throw new BadRequestException('minOrders must be greater than zero for minimum_orders targets');
      }
      return { type: 'minimum_orders', minOrders };
    }
    if (input.type === 'minimum_orders_recent') {
      const minOrders = Number.isFinite(Number(input.minOrders)) ? Math.trunc(Number(input.minOrders)) : 1;
      const days = Number.isFinite(Number(input.days)) ? Math.trunc(Number(input.days)) : 30;
      if (minOrders <= 0) {
        throw new BadRequestException('minOrders must be greater than zero for minimum_orders_recent targets');
      }
      if (days <= 0) {
        throw new BadRequestException('days must be greater than zero for minimum_orders_recent targets');
      }
      return { type: 'minimum_orders_recent', minOrders, days };
    }
    if (input.type === 'delivery_campaign_customers') {
      const deliveryCampaignId = String(input.deliveryCampaignId ?? '').trim();
      if (!deliveryCampaignId) {
        throw new BadRequestException('deliveryCampaignId is required for delivery_campaign_customers targets');
      }
      return { type: 'delivery_campaign_customers', deliveryCampaignId };
    }
    if (input.type === 'role') {
      if (!input.role) {
        throw new BadRequestException('role is required for role targets');
      }
      if (input.role === UserRole.ADMIN) {
        return { type: 'roles', roles: [UserRole.ADMIN, UserRole.STAFF] };
      }
      return { type: 'role', role: input.role };
    }
    if (input.type === 'area') {
      if (!input.areaId) {
        throw new BadRequestException('areaId is required for area targets');
      }
      return { type: 'area', areaId: input.areaId };
    }
    if (input.type === 'areas') {
      const areaIds = Array.from(new Set((input.areaIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)));
      if (!areaIds.length) {
        throw new BadRequestException('areaIds is required for areas targets');
      }
      return { type: 'areas', areaIds };
    }
    if (input.type === 'provider') {
      if (!input.providerId) {
        throw new BadRequestException('providerId is required for provider targets');
      }
      return { type: 'provider', providerId: input.providerId };
    }
    if (!input.userId) {
      throw new BadRequestException('userId is required for user targets');
    }
    return { type: 'user', userId: input.userId };
  }
}
