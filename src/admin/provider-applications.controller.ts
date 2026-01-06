import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import {
  ApproveProviderApplicationDto,
  ProviderApplicationListRequestDto,
  RejectProviderApplicationDto,
} from './dto/provider-application.dto';
import { ProviderApplicationsService } from '../providers/provider-applications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Admin/ProviderApplications')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/provider-applications', version: ['1'] })
export class AdminProviderApplicationsController {
  constructor(
    private readonly svc: AdminService,
    private readonly applications: ProviderApplicationsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiOkResponse({ description: 'Paginated provider applications' })
  async list(@Query() query: ProviderApplicationListRequestDto) {
    const where: Prisma.ProviderApplicationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.providerType = query.type;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.q) {
      where.OR = [
        { businessName: { contains: query.q, mode: 'insensitive' } },
        { ownerName: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.providerApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          provider: { select: { id: true, name: true, status: true } },
        },
      }),
      this.svc.prisma.providerApplication.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const application = await this.svc.prisma.providerApplication.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, status: true } },
      },
    });
    if (!application) throw new NotFoundException('Provider application not found');
    return application;
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveProviderApplicationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.applications.approveApplication(
      id,
      {
        planId: dto.planId,
        commissionRateBpsOverride: dto.commissionRateBpsOverride ?? null,
        branch: dto.branch ?? null,
      },
      user?.userId,
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectProviderApplicationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.applications.rejectApplication(id, dto.reason ?? null, user?.userId);
  }
}
