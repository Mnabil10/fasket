import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateGuestOrderDto, GuestOrderQuoteDto } from './dto/guest-order.dto';

@ApiTags('Orders/Guest')
@Controller({ path: 'orders/guest', version: ['1', '2'] })
export class GuestOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  quote(@Body() dto: GuestOrderQuoteDto) {
    return this.orders.quoteGuestOrder(dto);
  }

  @Post()
  create(@Body() dto: CreateGuestOrderDto) {
    return this.orders.createGuestOrder(dto);
  }

  @Get('track')
  @ApiQuery({ name: 'phone', required: true })
  @ApiQuery({ name: 'code', required: false })
  track(@Query('phone') phone: string, @Query('code') code?: string) {
    return this.orders.trackGuestOrders(phone, code);
  }
}
