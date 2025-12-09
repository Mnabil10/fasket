import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]:;"'`|<>,.?/]{8,}$/;

  constructor(private prisma: PrismaService) {}

  async me(userId: string) {
    const [user, ordersCount, sums] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true, loyaltyPoints: true },
      }),
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.aggregate({ where: { userId }, _sum: { totalCents: true } }),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const totalSpentCents = sums._sum.totalCents ?? 0;
    const points = user.loyaltyPoints ?? 0;
    const loyaltyTier =
      points >= 5000 ? 'Platinum' : points >= 2500 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
    return {
      ...user,
      ordersCount,
      totalSpentCents,
      points,
      loyaltyPoints: points,
      loyaltyTier,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }
    if (!this.passwordPolicy.test(dto.newPassword)) {
      throw new BadRequestException('Password must be at least 8 chars and contain letters and numbers');
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

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.email !== undefined) {
      data.email = dto.email;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No profile fields provided');
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const targetMeta = error.meta?.target;
          const targets = Array.isArray(targetMeta)
            ? targetMeta
            : typeof targetMeta === 'string'
              ? [targetMeta]
              : [];
          if (targets.includes('phone')) {
            throw new BadRequestException('Phone number already in use');
          }
          if (targets.includes('email')) {
            throw new BadRequestException('Email already in use');
          }
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
      }
      throw error;
    }
    return this.me(userId);
  }
}
