import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { TrackEventsDto } from './dto/track-events.dto';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'analytics', version: ['1'] })
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('events')
  trackEvents(@CurrentUser() user: CurrentUserPayload, @Body() dto: TrackEventsDto) {
    const appOpenCount = (dto.events ?? []).filter((event) => String(event.name ?? '').toLowerCase() === 'app_open').length;
    if (appOpenCount > 0) {
      this.prisma.user
        .update({
          where: { id: user.userId },
          data: {
            appOpenCount: { increment: appOpenCount },
            lastAppOpenAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
    return this.analytics.ingest(user.userId, dto);
  }
}
