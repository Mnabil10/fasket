import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { ReviewsService } from '../reviews/reviews.service';
import { AdminReviewListDto, ReviewModerateDto } from '../reviews/dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Admin/Reviews')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/reviews', version: ['1'] })
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated reviews' })
  list(@Query() query: AdminReviewListDto) {
    return this.reviews.listAdminReviews(query);
  }

  @Patch(':id')
  moderate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ReviewModerateDto,
  ) {
    return this.reviews.moderateReview(user.userId, id, dto);
  }
}
