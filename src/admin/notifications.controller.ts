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
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: AdminNotificationCreateDto) {
    const target = this.toTarget(dto.target);
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

  private toTarget(input: NotificationTargetDto): NotificationTarget {
    if (input.type === 'all') {
      return { type: 'broadcast' };
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
