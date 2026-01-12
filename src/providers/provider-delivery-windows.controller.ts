import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDeliveryWindowDto,
  DeliveryWindowListQueryDto,
  UpdateDeliveryWindowDto,
} from '../admin/dto/delivery-window.dto';

@ApiTags('Provider/DeliveryWindows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/delivery-windows', version: ['1'] })
export class ProviderDeliveryWindowsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiOkResponse({ description: 'Paginated delivery windows' })
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: DeliveryWindowListQueryDto) {
    const providerId = await this.resolveProviderScope(user);
    const where: Prisma.DeliveryWindowWhereInput = { providerId };
    if (query.branchId) where.branchId = query.branchId;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { nameAr: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deliveryWindow.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { startMinutes: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.deliveryWindow.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerId = await this.resolveProviderScope(user);
    const window = await this.prisma.deliveryWindow.findFirst({
      where: { id, providerId },
    });
    if (!window) throw new NotFoundException('Delivery window not found');
    return window;
  }

  @Post()
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateDeliveryWindowDto) {
    const providerId = await this.resolveProviderScope(user);
    if (dto.branchId) {
      await this.assertBranch(providerId, dto.branchId);
    }
    const daysOfWeek = this.normalizeDaysOfWeek(dto.daysOfWeek);
    this.assertTimeWindow(dto.startMinutes, dto.endMinutes);
    return this.prisma.deliveryWindow.create({
      data: {
        providerId,
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
  async update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateDeliveryWindowDto) {
    const providerId = await this.resolveProviderScope(user);
    const existing = await this.prisma.deliveryWindow.findFirst({
      where: { id, providerId },
    });
    if (!existing) throw new NotFoundException('Delivery window not found');

    const branchId = dto.branchId ?? existing.branchId ?? null;
    if (branchId) {
      await this.assertBranch(providerId, branchId);
    }
    const startMinutes = dto.startMinutes ?? existing.startMinutes;
    const endMinutes = dto.endMinutes ?? existing.endMinutes;
    this.assertTimeWindow(startMinutes, endMinutes);
    const daysOfWeek = dto.daysOfWeek ? this.normalizeDaysOfWeek(dto.daysOfWeek) : existing.daysOfWeek;

    return this.prisma.deliveryWindow.update({
      where: { id },
      data: {
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
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const providerId = await this.resolveProviderScope(user);
    const existing = await this.prisma.deliveryWindow.findFirst({
      where: { id, providerId },
    });
    if (!existing) throw new NotFoundException('Delivery window not found');
    await this.prisma.deliveryWindow.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveProviderScope(user?: CurrentUserPayload): Promise<string> {
    if (!user || user.role !== UserRole.PROVIDER) {
      throw new BadRequestException('Provider account is not linked');
    }
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { status: true } } },
    });
    if (!membership) {
      throw new BadRequestException('Provider account is not linked');
    }
    if (membership.provider.status !== ProviderStatus.ACTIVE) {
      throw new BadRequestException('Provider account is not active');
    }
    return membership.providerId;
  }

  private async assertBranch(providerId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
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
