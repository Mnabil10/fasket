import { Body, Controller, Get, Logger, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import { TwoFaGuard } from '../common/guards/twofa.guard';
import { Throttle } from '@nestjs/throttler';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Admin/Coupons')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(TwoFaGuard)
@Throttle({ default: { limit: 20, ttl: 60 } })
@Controller({ path: 'admin/coupons', version: ['1'] })
export class AdminCouponsController {
  private readonly logger = new Logger(AdminCouponsController.name);

  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ description: 'Paginated coupons' })
  async list(@Query('q') q?: string, @Query() page?: PaginationDto) {
    const where: any = {};
    if (q) where.code = { contains: q, mode: 'insensitive' };
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page?.skip, take: page?.take }),
      this.svc.prisma.coupon.count({ where }),
    ]);
    return { items, total, page: page?.page, pageSize: page?.pageSize };
  }

  @Post()
  create(@Body() dto: any) {
    // dto: { code, type, valueCents|percent, startsAt?, endsAt?, isActive?, minOrderCents?, maxDiscountCents? }
    const data: any = { ...dto, type: (dto.type as string | undefined) ?? 'PERCENT' };
    const suppliedValue = dto.percent ?? dto.value ?? dto.valueCents;
    data.valueCents = suppliedValue != null ? Number(suppliedValue) : 0;

    if (data.type === 'PERCENT' && data.valueCents < 0) {
      throw new BadRequestException('percent (valueCents) must be >= 0');
    }
    if (data.type === 'FIXED' && data.valueCents < 0) {
      throw new BadRequestException('valueCents must be >= 0 for FIXED coupons');
    }
    const createdPromise = this.svc.prisma.coupon.create({ data });
    createdPromise.then(async (coupon) => {
      this.logger.log({ msg: 'Coupon created', couponId: coupon.id, code: coupon.code, type: coupon.type });
      await this.svc.audit.log({
        action: 'coupon.create',
        entity: 'Coupon',
        entityId: coupon.id,
        after: coupon,
      });
    });
    return createdPromise;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.prisma.$transaction(async (tx) => {
      const before = await tx.coupon.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Coupon not found');
      }
      const data: any = { ...dto };
      const suppliedValue = dto.percent ?? dto.value ?? dto.valueCents;
      if (suppliedValue != null) {
        data.type = dto.type ?? 'PERCENT';
        data.valueCents = Number(suppliedValue);
      } else if (before.valueCents != null) {
        data.valueCents = before.valueCents;
      }
      if ((data.type ?? before.type) === 'PERCENT' && data.valueCents < 0) {
        throw new BadRequestException('percent (valueCents) must be >= 0');
      }
      if ((data.type ?? before.type) === 'FIXED' && data.valueCents < 0) {
        throw new BadRequestException('valueCents must be >= 0 for FIXED coupons');
      }
      const updated = await tx.coupon.update({ where: { id }, data });
      this.logger.log({ msg: 'Coupon updated', couponId: updated.id, code: updated.code, isActive: updated.isActive });
      await this.svc.audit.log({
        action: 'coupon.update',
        entity: 'Coupon',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
  }
}
