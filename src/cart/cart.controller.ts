import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddToCartDto, UpdateCartItemDto } from './dto';

@ApiTags('Cart')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private service: CartService) {}

  @Get()
  get(@CurrentUser() user: any) {
    return this.service.get(user.userId);
  }

  @Post('items')
  add(@CurrentUser() user: any, @Body() dto: AddToCartDto) {
    return this.service.add(user.userId, dto);
  }

  @Patch('items/:id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.service.updateQty(user.userId, id, dto.qty);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }
}
