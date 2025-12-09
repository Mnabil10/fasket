import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ReceiptService } from './receipt.service';
import { Response } from 'express';

@ApiTags('Orders')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard)
@Controller({ path: 'orders', version: ['1', '2'] })
export class OrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly receipts: ReceiptService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.userId);
  }

  @Get(':id')
  async detail(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Res() res: Response) {
    const result = await this.service.detail(user.userId, id);
    if (result.etag) {
      res.setHeader('ETag', result.etag);
    }
    return res.json(result);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.service.create(user.userId, dto);
  }

  @Post(':id/reorder')
  reorder(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.reorder(user.userId, id);
  }

  @Get(':id/receipt')
  receipt(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.receipts.getForCustomer(id, user.userId);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.cancelOrder(user.userId, id);
  }
}
