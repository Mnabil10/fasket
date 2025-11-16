import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Orders')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard)
@Controller({ path: 'orders', version: ['1', '2'] })
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.userId);
  }

  @Get(':id')
  detail(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.detail(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.service.create(user.userId, dto);
  }
}
