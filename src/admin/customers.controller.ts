import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AdminOnly, StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';
import * as bcrypt from 'bcrypt';

class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(6)
  newPassword!: string;
}

@ApiTags('Admin/Customers')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private svc: AdminService) {}

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
}
