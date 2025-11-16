import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'addresses', version: ['1', '2'] })
export class AddressesController {
  constructor(private service: AddressesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateAddressDto) {
    return this.service.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }
}
