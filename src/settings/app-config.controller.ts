import { Controller, Get, Version } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('App')
@Controller({ path: 'app', version: ['1', '2'] })
export class AppConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get('config')
  @Version(['1', '2'])
  async getConfig() {
    const [settings, delivery, loyalty] = await Promise.all([
      this.settings.getSettings(),
      this.settings.getDeliveryConfig(),
      this.settings.getLoyaltyConfig(),
    ]);
    const deliveryWithMessages = {
      ...delivery,
      deliveryZones: delivery.deliveryZones.map((zone) => ({
        ...zone,
        etaTextEn: this.settings.formatEtaLocalized(zone.etaMinutes, 'en'),
        etaTextAr: this.settings.formatEtaLocalized(zone.etaMinutes, 'ar'),
        feeMessageEn: this.settings.buildZoneMessages(zone).feeMessageEn,
        feeMessageAr: this.settings.buildZoneMessages(zone).feeMessageAr,
      })),
    };
    return {
      store: {
        name: settings.storeName,
        nameAr: settings.storeNameAr ?? undefined,
        description: settings.storeDescription ?? undefined,
        descriptionAr: settings.storeDescriptionAr ?? undefined,
        contactEmail: settings.contactEmail ?? undefined,
        contactPhone: settings.contactPhone ?? undefined,
        address: settings.storeAddress ?? undefined,
        currency: settings.currency,
        timezone: settings.timezone,
        language: settings.language,
        maintenanceMode: settings.maintenanceMode ?? false,
      },
      delivery: deliveryWithMessages,
      loyalty,
      payment: settings.payment ?? undefined,
      notifications: settings.notifications ?? undefined,
      businessHours: settings.businessHours ?? undefined,
    };
  }
}
