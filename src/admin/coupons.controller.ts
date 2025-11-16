import { Body, Controller, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('Admin/Coupons')
@ApiBearerAuth()
@AdminOnly()
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
    // if percent provided, map to type=PERCENT and valueCents=percent
    const data: any = { ...dto };
    if (dto.percent != null && dto.type == null) {
      data.type = 'PERCENT';
      data.valueCents = Number(dto.percent);
    }
    const created = this.svc.prisma.coupon.create({ data });
    created.then((coupon) =>
      this.logger.log({ msg: 'Coupon created', couponId: coupon.id, code: coupon.code, type: coupon.type }),
    );
    return created;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    const updated = this.svc.prisma.coupon.update({ where: { id }, data: dto });
    updated.then((coupon) =>
      this.logger.log({ msg: 'Coupon updated', couponId: coupon.id, code: coupon.code, isActive: coupon.isActive }),
    );
    return updated;
  }
}
