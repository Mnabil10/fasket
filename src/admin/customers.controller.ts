import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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

class AdminCustomerQueryDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'search name/phone/email' })
  @IsOptional()
  @IsString()
  q?: string;
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
  @ApiOkResponse({ description: 'Paginated customers' })
  async list(@Query() query: AdminCustomerQueryDto) {
    const { q, ...page } = query;
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
        skip: (page as PaginationDto).skip, take: (page as PaginationDto).take,
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

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete customer (only when no orders exist)' })
  async deleteCustomer(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    const user = await this.svc.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot delete admin users');
    }

    const ordersCount = await this.svc.prisma.order.count({ where: { userId: id } });
    if (ordersCount > 0) {
      throw new BadRequestException('Cannot delete user with existing orders');
    }

    await this.svc.prisma.$transaction([
      this.svc.prisma.cartItem.deleteMany({ where: { cart: { userId: id } } }),
      this.svc.prisma.cart.deleteMany({ where: { userId: id } }),
      this.svc.prisma.address.deleteMany({ where: { userId: id } }),
      this.svc.prisma.sessionLog.deleteMany({ where: { userId: id } }),
      this.svc.prisma.loyaltyTransaction.deleteMany({ where: { userId: id } }),
      this.svc.prisma.loyaltyCycle.deleteMany({ where: { userId: id } }),
      this.svc.prisma.notificationDevice.deleteMany({ where: { userId: id } }),
      this.svc.prisma.telegramLink.deleteMany({ where: { userId: id } }),
      this.svc.prisma.user.delete({ where: { id } }),
    ]);

    await this.svc.audit.log({
      action: 'user.delete',
      entity: 'user',
      entityId: id,
      before: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      after: null,
      actorId: actor?.userId,
    });

    return { ok: true };
  }
}
