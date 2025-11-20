import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller({ path: 'settings', version: ['1'] })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('delivery-zones')
  async getActiveDeliveryZones() {
    const zones = await this.settings.getActiveDeliveryZones();
    return zones;
  }
}
