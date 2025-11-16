import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(userId: string) {
    const [user, ordersCount, sums] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.aggregate({ where: { userId }, _sum: { totalCents: true } }),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const totalSpentCents = sums._sum.totalCents ?? 0;
    const points = Math.floor(totalSpentCents / 100);
    const loyaltyTier =
      points >= 5000 ? 'Platinum' : points >= 2500 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
    return {
      ...user,
      ordersCount,
      totalSpentCents,
      points,
      loyaltyTier,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }
    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    return { ok: true };
  }
}
