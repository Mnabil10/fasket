import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { CreateDeliveryWindowDto, DeliveryWindowListQueryDto, UpdateDeliveryWindowDto } from './dto/delivery-window.dto';

@ApiTags('Admin/DeliveryWindows')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/delivery-windows', version: ['1'] })
export class AdminDeliveryWindowsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiQuery({ name: 'providerId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiOkResponse({ description: 'Paginated delivery windows' })
  async list(@Query() query: DeliveryWindowListQueryDto) {
    const where: Prisma.DeliveryWindowWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { nameAr: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [items, total] = await this.admin.prisma.$transaction([
      this.admin.prisma.deliveryWindow.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { startMinutes: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.admin.prisma.deliveryWindow.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const window = await this.admin.prisma.deliveryWindow.findUnique({ where: { id } });
    if (!window) throw new NotFoundException('Delivery window not found');
    return window;
  }

  @Post()
  async create(@Body() dto: CreateDeliveryWindowDto) {
    if (!dto.providerId) {
      throw new BadRequestException('providerId is required');
    }
    await this.assertProvider(dto.providerId);
    if (dto.branchId) {
      await this.assertBranch(dto.providerId, dto.branchId);
    }
    const daysOfWeek = this.normalizeDaysOfWeek(dto.daysOfWeek);
    this.assertTimeWindow(dto.startMinutes, dto.endMinutes);
    return this.admin.prisma.deliveryWindow.create({
      data: {
        providerId: dto.providerId,
        branchId: dto.branchId ?? null,
        name: dto.name.trim(),
        nameAr: dto.nameAr ?? null,
        startMinutes: dto.startMinutes,
        endMinutes: dto.endMinutes,
        daysOfWeek: daysOfWeek ?? [],
        minLeadMinutes: dto.minLeadMinutes ?? null,
        minOrderAmountCents: dto.minOrderAmountCents ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDeliveryWindowDto) {
    const existing = await this.admin.prisma.deliveryWindow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery window not found');

    const providerId = dto.providerId ?? existing.providerId;
    await this.assertProvider(providerId);
    const branchId = dto.branchId ?? existing.branchId ?? null;
    if (branchId) {
      await this.assertBranch(providerId, branchId);
    }
    const startMinutes = dto.startMinutes ?? existing.startMinutes;
    const endMinutes = dto.endMinutes ?? existing.endMinutes;
    this.assertTimeWindow(startMinutes, endMinutes);
    const daysOfWeek = dto.daysOfWeek ? this.normalizeDaysOfWeek(dto.daysOfWeek) : existing.daysOfWeek;

    return this.admin.prisma.deliveryWindow.update({
      where: { id },
      data: {
        providerId: dto.providerId,
        branchId: dto.branchId,
        name: dto.name?.trim(),
        nameAr: dto.nameAr,
        startMinutes: dto.startMinutes,
        endMinutes: dto.endMinutes,
        daysOfWeek: daysOfWeek ?? [],
        minLeadMinutes: dto.minLeadMinutes ?? undefined,
        minOrderAmountCents: dto.minOrderAmountCents ?? undefined,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.admin.prisma.deliveryWindow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery window not found');
    await this.admin.prisma.deliveryWindow.delete({ where: { id } });
    return { ok: true };
  }

  private async assertProvider(providerId: string) {
    const provider = await this.admin.prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (!provider) {
      throw new BadRequestException('Provider not found');
    }
  }

  private async assertBranch(providerId: string, branchId: string) {
    const branch = await this.admin.prisma.branch.findFirst({
      where: { id: branchId, providerId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
  }

  private normalizeDaysOfWeek(days?: number[] | null) {
    if (!Array.isArray(days)) return undefined;
    const normalized = Array.from(new Set(days.map((value) => Math.floor(Number(value)))));
    for (const day of normalized) {
      if (!Number.isFinite(day) || day < 0 || day > 6) {
        throw new BadRequestException('daysOfWeek must contain values between 0 and 6');
      }
    }
    return normalized.sort((a, b) => a - b);
  }

  private assertTimeWindow(startMinutes: number, endMinutes: number) {
    if (startMinutes >= endMinutes) {
      throw new BadRequestException('startMinutes must be less than endMinutes');
    }
  }
}
