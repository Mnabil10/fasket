import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateGuestOrderDto, GuestOrderQuoteDto, GuestOrderTrackOtpRequestDto, GuestOrderTrackOtpVerifyDto } from './dto/guest-order.dto';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@ApiTags('Orders/Guest')
@Controller({ path: 'orders/guest', version: ['1', '2'] })
export class GuestOrdersController {
  private readonly guestOrdersEnabled: boolean;

  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {
    this.guestOrdersEnabled = (this.config.get<string>('GUEST_ORDERS_ENABLED') ?? 'true') !== 'false';
  }

  private assertGuestOrdersEnabled() {
    if (!this.guestOrdersEnabled) {
      throw new ForbiddenException('Guest orders are disabled');
    }
  }

  @Post('quote')
  quote(@Body() dto: GuestOrderQuoteDto) {
    this.assertGuestOrdersEnabled();
    return this.orders.quoteGuestOrder(dto);
  }

  @Post()
  create(@Body() dto: CreateGuestOrderDto) {
    this.assertGuestOrdersEnabled();
    return this.orders.createGuestOrder(dto);
  }

  @Post('track/request-otp')
  requestTrackingOtp(@Body() dto: GuestOrderTrackOtpRequestDto, @Req() req: Request) {
    this.assertGuestOrdersEnabled();
    return this.orders.requestGuestTrackingOtp(dto.phone, req.ip);
  }

  @Post('track/verify-otp')
  verifyTrackingOtp(@Body() dto: GuestOrderTrackOtpVerifyDto, @Req() req: Request) {
    this.assertGuestOrdersEnabled();
    return this.orders.trackGuestOrdersWithOtp(dto.phone, dto.otp, dto.otpId, dto.code, req.ip);
  }

  @Get('track')
  @ApiQuery({ name: 'phone', required: true })
  @ApiQuery({ name: 'code', required: false })
  track(@Query('phone') phone: string, @Query('code') code?: string) {
    this.assertGuestOrdersEnabled();
    return this.orders.trackGuestOrders(phone, code);
  }
}
