import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { BranchListRequestDto, CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@ApiTags('Admin/Branches')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/branches', version: ['1'] })
export class AdminBranchesController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'providerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Paginated branches' })
  async list(@Query() query: BranchListRequestDto) {
    const where: Prisma.BranchWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status as any;

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.branch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          provider: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.svc.prisma.branch.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.svc.prisma.branch.findUnique({
      where: { id },
      include: { provider: { select: { id: true, name: true, slug: true } } },
    });
  }

  @Post()
  async create(@Body() dto: CreateBranchDto) {
    const provider = await this.svc.prisma.provider.findUnique({ where: { id: dto.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    const payload = await this.prepareBranchPayload(dto);
    if (!payload.slug) {
      payload.slug = await this.svc.slugs.generateUniqueSlug('branch', dto.slug ?? dto.name);
    }
    if (payload.isDefault) {
      await this.svc.prisma.branch.updateMany({
        where: { providerId: dto.providerId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await this.svc.prisma.branch.create({ data: payload as Prisma.BranchCreateInput });
    await this.svc.audit.log({
      action: 'branch.create',
      entity: 'Branch',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    const existing = await this.svc.prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Branch not found');
    const payload = await this.prepareBranchPayload(dto, id);
    if (payload.isDefault) {
      await this.svc.prisma.branch.updateMany({
        where: { providerId: existing.providerId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    const updated = await this.svc.prisma.branch.update({
      where: { id },
      data: payload as Prisma.BranchUpdateInput,
    });
    await this.svc.audit.log({
      action: 'branch.update',
      entity: 'Branch',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  private async prepareBranchPayload(dto: CreateBranchDto | UpdateBranchDto, id?: string) {
    const data: Record<string, any> = { ...dto };
    if (id) delete data.providerId;
    if (data.name) data.name = data.name.trim();
    if (data.slug) {
      data.slug = await this.svc.slugs.generateUniqueSlug('branch', data.slug, id);
    }
    return data;
  }
}
