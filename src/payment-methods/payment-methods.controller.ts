import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { CreatePaymentMethodDto } from './dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('PaymentMethods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'payment-methods', version: ['1', '2'] })
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreatePaymentMethodDto) {
    return this.service.create(user.userId, dto);
  }

  @Patch(':id/default')
  setDefault(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.setDefault(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }
}
