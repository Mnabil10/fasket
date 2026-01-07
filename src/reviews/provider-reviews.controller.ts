import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewListDto, ReviewReplyDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Provider/Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/reviews', version: ['1'] })
export class ProviderReviewsController {
  constructor(private readonly service: ReviewsService, private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: ReviewListDto) {
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { id: true, status: true } } },
    });
    if (!membership?.providerId || membership.provider.status !== 'ACTIVE') {
      if (!membership?.providerId) {
        return { items: [], total: 0, page: query.page, pageSize: query.pageSize, ratingAvg: 0, ratingCount: 0 };
      }
      throw new ForbiddenException('Provider account is not active');
    }
    return this.service.listProviderReviews(membership.providerId, query);
  }

  @Post(':id/reply')
  async reply(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReviewReplyDto) {
    return this.service.replyToReview(user.userId, id, dto);
  }
}
