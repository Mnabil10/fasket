import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
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

  @Get('delivery-windows')
  @ApiQuery({ name: 'providerId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'day', required: false, description: 'Day of week (0=Sunday ... 6=Saturday)' })
  async getDeliveryWindows(
    @Query('providerId') providerId?: string,
    @Query('branchId') branchId?: string,
    @Query('day') day?: string,
  ) {
    const provider = providerId?.trim() || undefined;
    const branch = branchId?.trim() || undefined;
    if (!provider && !branch) return [];
    const dayValue = day !== undefined ? Number(day) : undefined;
    return this.settings.listDeliveryWindows({
      providerId: provider,
      branchId: branch,
      isActive: true,
      day: Number.isFinite(dayValue) ? dayValue : undefined,
    });
  }

  @Get('app')
  async getAppSettings() {
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
      mobileApp: settings.mobileAppConfig ?? undefined,
      delivery: deliveryWithMessages,
      loyalty,
      payment: settings.payment ?? undefined,
      notifications: settings.notifications ?? undefined,
      businessHours: settings.businessHours ?? undefined,
    };
  }
}
