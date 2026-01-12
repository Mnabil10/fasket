import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateGuestOrderDto, GuestOrderQuoteDto, GuestOrderTrackOtpRequestDto, GuestOrderTrackOtpVerifyDto } from './dto/guest-order.dto';
import { Request } from 'express';

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

  @Post('track/request-otp')
  requestTrackingOtp(@Body() dto: GuestOrderTrackOtpRequestDto, @Req() req: Request) {
    return this.orders.requestGuestTrackingOtp(dto.phone, req.ip);
  }

  @Post('track/verify-otp')
  verifyTrackingOtp(@Body() dto: GuestOrderTrackOtpVerifyDto, @Req() req: Request) {
    return this.orders.trackGuestOrdersWithOtp(dto.phone, dto.otp, dto.otpId, dto.code, req.ip);
  }

  @Get('track')
  @ApiQuery({ name: 'phone', required: true })
  @ApiQuery({ name: 'code', required: false })
  track(@Query('phone') phone: string, @Query('code') code?: string) {
    return this.orders.trackGuestOrders(phone, code);
  }
}
