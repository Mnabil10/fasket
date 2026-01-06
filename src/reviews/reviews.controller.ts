import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateReviewDto, ReviewListDto, UpdateReviewDto } from './dto';

@ApiTags('Reviews')
@Controller({ path: 'reviews', version: ['1'] })
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get('order/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getForOrder(@CurrentUser() user: CurrentUserPayload, @Param('orderId') orderId: string) {
    return this.service.getReviewForOrder(user.userId, orderId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReviewDto) {
    return this.service.createReview(user.userId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.service.updateReview(user.userId, id, dto);
  }

  @Get('provider/:providerId')
  listProvider(@Param('providerId') providerId: string, @Query() query: ReviewListDto) {
    return this.service.listProviderReviews(providerId, query);
  }
}
