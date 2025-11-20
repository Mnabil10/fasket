import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { LoyaltyHistoryQueryDto } from './dto/loyalty.dto';

@ApiTags('Loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/loyalty', version: ['1'] })
export class UserLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  summary(@CurrentUser() user: CurrentUserPayload, @Query() query: LoyaltyHistoryQueryDto) {
    return this.loyalty.getUserSummary(user.userId, { historyLimit: query.limit });
  }
}
