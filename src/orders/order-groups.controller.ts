import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/order-groups', version: ['1'] })
export class OrderGroupsController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.orders.listOrderGroups(user.userId);
  }

  @Get(':id')
  detail(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.orders.getOrderGroupDetail(user.userId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.orders.cancelOrderGroup(user.userId, id);
  }
}
