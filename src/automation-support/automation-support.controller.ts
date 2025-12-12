import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AutomationHmacGuard } from '../automation/automation-hmac.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AutomationSupportService } from './automation-support.service';
import { Request } from 'express';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

class SupportOrderStatusDto {
  @ApiProperty() @IsString()
  phone!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  orderCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  last4?: string;
}

class SupportProductSearchDto {
  @ApiProperty() @IsString()
  q!: string;
}

@ApiTags('Automation/Support')
@UseGuards(AutomationHmacGuard, ThrottlerGuard)
@Controller({ path: 'automation/support', version: ['1'] })
export class AutomationSupportController {
  constructor(private readonly support: AutomationSupportService) {}

  @Post('order-status')
  @Throttle({ supportBot: {} })
  orderStatus(@Body() dto: SupportOrderStatusDto, @Req() req: Request) {
    return this.support.orderStatusLookup({
      phone: dto.phone,
      orderCode: dto.orderCode,
      last4: dto.last4,
      ip: req.ip,
      correlationId: req.headers['x-correlation-id'] as string | undefined,
    });
  }

  @Post('product-search')
  @Throttle({ supportBotSearch: {} })
  productSearch(@Body() dto: SupportProductSearchDto, @Req() req: Request) {
    return this.support.productSearch(dto.q, req.ip);
  }

  @Get('delivery-zones')
  @Throttle({ supportBotSearch: {} })
  deliveryZones() {
    return this.support.deliveryZones();
  }
}
