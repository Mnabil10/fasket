import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

const DEFAULT_PREFS = {
  orderUpdates: true,
  loyalty: true,
  marketing: false,
  whatsappOrderUpdates: true,
};

class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  loyalty?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappOrderUpdates?: boolean;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'user', version: ['1', '2'] })
export class UserNotificationPreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('notification-preferences')
  async get(@CurrentUser() user: CurrentUserPayload) {
    const existing = await this.prisma.userNotificationPreference.findUnique({
      where: { userId: user.userId },
    });
    if (!existing) {
      const created = await this.prisma.userNotificationPreference.create({
        data: { userId: user.userId, preferences: DEFAULT_PREFS as Prisma.InputJsonValue },
      });
      return created.preferences;
    }
    return this.mergePreferences(existing.preferences);
  }

  @Patch('notification-preferences')
  async update(@CurrentUser() user: CurrentUserPayload, @Body() dto: NotificationPreferencesDto) {
    const existing = await this.prisma.userNotificationPreference.findUnique({
      where: { userId: user.userId },
    });
    const next = this.mergePreferences(dto, existing?.preferences ?? DEFAULT_PREFS);
    const payload = next as Prisma.InputJsonValue;
    const updated = await this.prisma.userNotificationPreference.upsert({
      where: { userId: user.userId },
      update: { preferences: payload },
      create: { userId: user.userId, preferences: payload },
    });
    return updated.preferences;
  }

  private mergePreferences(
    input?: NotificationPreferencesDto | Record<string, unknown> | Prisma.JsonValue,
    base: Record<string, unknown> | Prisma.JsonValue = DEFAULT_PREFS,
  ) {
    const normalizedBase =
      base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : DEFAULT_PREFS;
    const data: Record<string, unknown> = { ...normalizedBase };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return data;
    const typed = input as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (typed[key] !== undefined) {
        data[key] = Boolean(typed[key]);
      }
    }
    return data;
  }
}
