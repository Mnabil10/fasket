import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddToCartDto, ApplyCouponDto, UpdateCartItemDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Cart')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard)
@Controller({ path: 'cart', version: ['1', '2'] })
export class CartController {
  constructor(private service: CartService) {}

  @Get()
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  get(
    @CurrentUser() user: CurrentUserPayload,
    @Query('lang', new ParseEnumPipe(['en', 'ar'], { optional: true })) lang?: 'en' | 'ar',
  ) {
    return this.service.get(user.userId, lang);
  }

  @Post('items')
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  add(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddToCartDto,
    @Query('lang', new ParseEnumPipe(['en', 'ar'], { optional: true })) lang?: 'en' | 'ar',
  ) {
    return this.service.add(user.userId, dto, lang);
  }

  @Post('apply-coupon')
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  applyCoupon(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ApplyCouponDto,
    @Query('lang', new ParseEnumPipe(['en', 'ar'], { optional: true })) lang?: 'en' | 'ar',
  ) {
    return this.service.applyCoupon(user.userId, dto, lang);
  }

  @Patch('items/:id')
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
    @Query('lang', new ParseEnumPipe(['en', 'ar'], { optional: true })) lang?: 'en' | 'ar',
  ) {
    return this.service.updateQty(user.userId, id, dto.qty, lang);
  }

  @Delete('items/:id')
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'ar'] })
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('lang', new ParseEnumPipe(['en', 'ar'], { optional: true })) lang?: 'en' | 'ar',
  ) {
    return this.service.remove(user.userId, id, lang);
  }
}
