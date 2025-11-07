import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto';

@ApiTags('Orders')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.list(user.userId);
  }

  @Get(':id')
  detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.detail(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.service.create(user.userId, {
      addressId: dto.addressId,
      paymentMethod: dto.paymentMethod,
      cartId: dto.cartId,
      items: dto.items,
      notes: dto.notes,
      couponCode: dto.couponCode,
    });
  }
}
