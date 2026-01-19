import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StaffOrAdmin } from './_admin-guards';
import { DeliveryCampaignsService } from '../delivery-campaigns/delivery-campaigns.service';
import {
  DeliveryCampaignCreateDto,
  DeliveryCampaignListDto,
  DeliveryCampaignNotifyDto,
  DeliveryCampaignUpdateDto,
} from './dto/delivery-campaigns.dto';
import { DomainError, ErrorCode } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Admin/DeliveryCampaigns')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/delivery-campaigns', version: ['1'] })
export class AdminDeliveryCampaignsController {
  private readonly logger = new Logger(AdminDeliveryCampaignsController.name);

  constructor(
    private readonly campaigns: DeliveryCampaignsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated delivery campaigns list' })
  list(@Query() query: DeliveryCampaignListDto) {
    return this.campaigns.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      isActive: query.isActive,
      activeNow: query.activeNow,
      zoneId: query.zoneId,
      providerId: query.providerId,
    });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Delivery campaign details' })
  get(@Param('id') id: string) {
    return this.campaigns.getById(id);
  }

  @Post()
  @ApiOkResponse({ description: 'Create delivery campaign' })
  create(@Body() dto: DeliveryCampaignCreateDto) {
    const deliveryPriceCents = this.resolveDeliveryPriceCents(dto);
    const maxDiscountCents = this.resolveMaxDiscountCents(dto);
    return this.campaigns.create({
      name: dto.name,
      zoneIds: dto.zones,
      providerIds: dto.providers,
      deliveryPriceCents,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      isActive: dto.isActive ?? true,
      maxOrders: dto.maxOrders ?? null,
      maxDiscountCents,
    });
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update delivery campaign' })
  update(@Param('id') id: string, @Body() dto: DeliveryCampaignUpdateDto) {
    const deliveryPriceCents =
      dto.deliveryPriceCents !== undefined || dto.deliveryPrice !== undefined
        ? this.resolveDeliveryPriceCents(dto)
        : undefined;
    const maxDiscountCents =
      dto.maxDiscountCents !== undefined || dto.maxDiscount !== undefined
        ? this.resolveMaxDiscountCents(dto)
        : undefined;
    return this.campaigns.update(id, {
      name: dto.name,
      zoneIds: dto.zones,
      providerIds: dto.providers,
      deliveryPriceCents,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      isActive: dto.isActive,
      maxOrders: dto.maxOrders ?? undefined,
      maxDiscountCents,
    });
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete delivery campaign' })
  delete(@Param('id') id: string) {
    return this.campaigns.delete(id);
  }

  @Post(':id/notify')
  @ApiOkResponse({ description: 'Send campaign notification' })
  async notify(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DeliveryCampaignNotifyDto,
  ) {
    const campaign = await this.campaigns.getById(id);
    const zoneIds = this.normalizeIds(dto.zoneIds?.length ? dto.zoneIds : campaign.zones);
    if (!zoneIds.length) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'At least one zone is required to send a campaign notification');
    }
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const notification = await this.notifications.createAdminNotification({
      title: dto.title.trim(),
      body: dto.body.trim(),
      type: dto.type ?? 'delivery_campaign',
      target: { type: 'areas', areaIds: zoneIds },
      scheduledAt,
      createdById: user.userId,
      channel: dto.channel,
      priority: dto.priority,
      sound: dto.sound ?? null,
      sendNow: dto.sendNow,
      deliveryCampaignId: campaign.id,
      data: {
        deliveryCampaignId: campaign.id,
        deliveryCampaignName: campaign.name,
        deliveryPriceCents: campaign.deliveryPriceCents,
        zones: zoneIds,
        providers: campaign.providers,
      },
    });
    this.logger.log({ msg: 'Delivery campaign notification created', campaignId: campaign.id, notificationId: notification.id });
    return notification;
  }

  private resolveDeliveryPriceCents(dto: { deliveryPrice?: number; deliveryPriceCents?: number }) {
    if (dto.deliveryPriceCents !== undefined && dto.deliveryPriceCents !== null) {
      return this.toNonNegativeInt(dto.deliveryPriceCents);
    }
    if (dto.deliveryPrice !== undefined && dto.deliveryPrice !== null) {
      return this.toNonNegativeInt((dto.deliveryPrice ?? 0) * 100);
    }
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Delivery price is required');
  }

  private resolveMaxDiscountCents(dto: { maxDiscount?: number | null; maxDiscountCents?: number | null }) {
    if (dto.maxDiscountCents !== undefined) {
      return dto.maxDiscountCents === null ? null : this.toNonNegativeInt(dto.maxDiscountCents);
    }
    if (dto.maxDiscount !== undefined) {
      return dto.maxDiscount === null ? null : this.toNonNegativeInt((dto.maxDiscount ?? 0) * 100);
    }
    return null;
  }

  private toNonNegativeInt(value: any) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  }

  private normalizeIds(ids?: string[]) {
    if (!ids) return [];
    return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  }
}
