import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AdjustLoyaltyPointsDto, LoyaltyHistoryQueryDto } from '../loyalty/dto/loyalty.dto';

class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(6)
  newPassword!: string;
}

@ApiTags('Admin/Customers')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/customers', version: ['1'] })
export class AdminCustomersController {
  constructor(
    private readonly svc: AdminService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @Get()
  @ApiQuery({ name: 'q', required: false, description: 'search name/phone/email' })
  @ApiOkResponse({ description: 'Paginated customers' })
  async list(@Query('q') q?: string, @Query() page?: PaginationDto) {
    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
        skip: page?.skip, take: page?.take,
      }),
      this.svc.prisma.user.count({ where }),
    ]);
    return { items, total, page: page?.page, pageSize: page?.pageSize };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Customer profile & recent orders' })
  detail(@Param('id') id: string) {
    return this.svc.prisma.user.findUnique({
      where: { id },
      include: {
        addresses: true,
        orders: {
          select: { id: true, totalCents: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 20
        },
      },
    });
  }

  @Patch(':id/role')
  @ApiOkResponse({ description: 'Update user role' })
  updateRole(@Param('id') id: string, @Body() dto: { role: UserRole }) {
    return this.svc.prisma.user.update({ where: { id }, data: { role: dto.role } });
  }

  @Patch(':id/password')
  @StaffOrAdmin()
  @ApiOkResponse({ description: 'Reset user password' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.svc.prisma.user.update({ where: { id }, data: { password: hash } });
    return { ok: true };
  }

  @Get(':id/loyalty')
  @ApiOkResponse({ description: 'Loyalty totals and transaction history' })
  loyaltyHistory(@Param('id') id: string, @Query() query: LoyaltyHistoryQueryDto) {
    return this.loyalty.getAdminSummary(id, { historyLimit: query.limit });
  }

  @Post(':id/loyalty-adjust')
  @ApiOkResponse({ description: 'Adjust loyalty balance' })
  adjustLoyalty(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AdjustLoyaltyPointsDto,
  ) {
    return this.loyalty.adjustUserPoints({
      userId: id,
      points: dto.points,
      reason: dto.reason,
      actorId: actor.userId,
    });
  }
}
