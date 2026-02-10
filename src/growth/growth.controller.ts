import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { GrowthService } from './growth.service';
import { LangNormalizePipe } from '../common/pipes/lang-normalize.pipe';

@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me', version: ['1', '2'] })
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get('orders/last')
  @ApiQuery({ name: 'limit', required: false })
  getLastOrders(@CurrentUser() user: CurrentUserPayload, @Query('limit') limit?: string) {
    return this.growth.getLastOrders(user.userId, limit ? Number(limit) : undefined);
  }

  @Get('products/frequently-bought')
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  getFrequentlyBought(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
    @Query('lang', LangNormalizePipe) lang?: 'en' | 'ar',
  ) {
    return this.growth.getFrequentlyBought(user.userId, limit ? Number(limit) : undefined, lang ?? 'en');
  }

  @Get('growth/first-order-wizard')
  getFirstOrderWizard(@CurrentUser() user: CurrentUserPayload) {
    return this.growth.getFirstOrderWizard(user.userId);
  }

  @Post('growth/first-order-wizard/dismiss')
  dismissFirstOrderWizard(@CurrentUser() user: CurrentUserPayload) {
    return this.growth.dismissFirstOrderWizard(user.userId);
  }
}
