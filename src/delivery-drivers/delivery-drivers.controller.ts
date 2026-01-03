import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { DeliveryDriversService } from './delivery-drivers.service';
import { DriverLocationDto } from './dto/driver-location.dto';

@ApiTags('Internal/Drivers')
@ApiBearerAuth()
@UseGuards(InternalSecretGuard)
@Controller({ path: 'internal/drivers', version: ['1'] })
export class InternalDriversController {
  constructor(private readonly drivers: DeliveryDriversService) {}

  @Post(':id/location')
  recordLocation(@Param('id') id: string, @Body() dto: DriverLocationDto) {
    return this.drivers.recordLocation(id, dto);
  }

  @Get(':id/location')
  getLatestLocation(@Param('id') id: string) {
    return this.drivers.getLatestLocation(id);
  }
}
