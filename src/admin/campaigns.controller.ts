import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CampaignChannel, CampaignStatus } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { CampaignCreateDto, CampaignListDto, CampaignUpdateDto } from './dto/campaigns.dto';
import { AutomationEventsService } from '../automation/automation-events.service';

@ApiTags('Admin/Campaigns')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/campaigns', version: ['1'] })
export class AdminCampaignsController {
  constructor(
    private readonly svc: AdminService,
    private readonly automation: AutomationEventsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated campaigns list' })
  async list(@Query() query: CampaignListDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;
    if (query.q) {
      const term = query.q.trim();
      if (term) {
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { message: { contains: term, mode: 'insensitive' } },
        ];
      }
    }
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.marketingCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.marketingCampaign.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post()
  create(@Body() dto: CampaignCreateDto) {
    return this.svc.prisma.marketingCampaign.create({
      data: {
        name: dto.name,
        title: dto.title,
        message: dto.message,
        channel: dto.channel ?? CampaignChannel.PUSH,
        status: CampaignStatus.DRAFT,
        scheduledAt: dto.scheduledAt ?? null,
        segment: dto.segment ?? undefined,
        payload: dto.payload ?? undefined,
      },
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CampaignUpdateDto) {
    return this.svc.prisma.marketingCampaign.update({
      where: { id },
      data: {
        name: dto.name,
        title: dto.title,
        message: dto.message,
        channel: dto.channel,
        status: dto.status,
        scheduledAt: dto.scheduledAt ?? undefined,
        segment: dto.segment ?? undefined,
        payload: dto.payload ?? undefined,
      },
    });
  }

  @Post(':id/emit')
  async emit(@Param('id') id: string) {
    const campaign = await this.svc.prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) {
      return { success: false, message: 'Campaign not found' };
    }
    await this.automation.emit(
      'marketing.campaign.send',
      {
        id: campaign.id,
        name: campaign.name,
        title: campaign.title,
        message: campaign.message,
        channel: campaign.channel,
        segment: campaign.segment,
        payload: campaign.payload,
        scheduledAt: campaign.scheduledAt,
      },
      { dedupeKey: `campaign:${campaign.id}` },
    );
    await this.svc.prisma.marketingCampaign.update({
      where: { id },
      data: { status: CampaignStatus.SENT, sentAt: new Date() },
    });
    return { success: true };
  }
}
