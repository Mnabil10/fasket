import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StaffOrAdmin } from './_admin-guards';
import { DeliveryDriversService } from '../delivery-drivers/delivery-drivers.service';
import {
  CreateDriverDto,
  UpdateDriverDto,
  UpdateDriverStatusDto,
  UpsertVehicleDto,
} from '../delivery-drivers/dto/driver.dto';

@ApiTags('Admin/DeliveryDrivers')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/delivery-drivers', version: ['1'] })
export class AdminDeliveryDriversController {
  constructor(private readonly drivers: DeliveryDriversService) {}

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  list(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.drivers.list({
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page,
      pageSize,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drivers.getById(id);
  }

  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDriverStatusDto) {
    return this.drivers.updateStatus(id, dto);
  }

  @Post(':id/vehicle')
  upsertVehicle(@Param('id') id: string, @Body() dto: UpsertVehicleDto) {
    return this.drivers.upsertVehicle(id, dto);
  }
}
