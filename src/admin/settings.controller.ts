import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import {
  UpdateSettingsDto,
  GeneralSettingsDto, DeliverySettingsDto, PaymentSettingsDto,
  NotificationsSettingsDto, SystemSettingsDto,
} from './dto/settings.dto';
import { Prisma } from '@prisma/client';

@ApiTags('Admin/Settings')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private svc: AdminService) {}

  private async getOrCreate() {
    const found = await this.svc.prisma.setting.findFirst();
    if (found) return found;
    // Ensure EGP default if creating the first settings row
    return this.svc.prisma.setting.create({ data: { currency: 'EGP' } });
  }

  /** Transform DB -> UI */
  private toUi(setting: any) {
    return {
      general: {
        storeName: setting.storeName,
        storeDescription: setting.storeDescription,
        contactEmail: setting.contactEmail,
        contactPhone: setting.contactPhone,
        storeAddress: setting.storeAddress,
        businessHours: setting.businessHours ?? undefined,
      },
      delivery: {
        deliveryFee: (setting.deliveryFeeCents ?? 0) / 100,
        freeDeliveryMinimum: (setting.freeDeliveryMinimumCents ?? 0) / 100,
        estimatedDeliveryTime: setting.estimatedDeliveryTime ?? null,
        maxDeliveryRadius: setting.maxDeliveryRadiusKm ?? null,
        deliveryZones: setting.deliveryZones ?? [],
      },
      payment: setting.payment ?? {},
      notifications: setting.notifications ?? {},
      system: {
        maintenanceMode: setting.maintenanceMode,
        allowRegistrations: setting.allowRegistrations,
        requireEmailVerification: setting.requireEmailVerification,
        sessionTimeout: setting.sessionTimeoutMinutes,
        maxLoginAttempts: setting.maxLoginAttempts,
        dataRetentionDays: setting.dataRetentionDays,
        backupFrequency: setting.backupFrequency,
        timezone: setting.timezone,
        language: setting.language,
        currency: setting.currency,
      },
      updatedAt: setting.updatedAt,
    };
  }

  /** Transform UI -> Prisma update */
  private toUpdate(data: UpdateSettingsDto): Prisma.SettingUpdateInput {
    const upd: Prisma.SettingUpdateInput = {};

    if (data.general) {
      const g = data.general as GeneralSettingsDto;
      if (g.storeName !== undefined)        upd.storeName = g.storeName;
      if (g.storeDescription !== undefined) upd.storeDescription = g.storeDescription;
      if (g.contactEmail !== undefined)     upd.contactEmail = g.contactEmail;
      if (g.contactPhone !== undefined)     upd.contactPhone = g.contactPhone;
      if (g.storeAddress !== undefined)     upd.storeAddress = g.storeAddress;
      if (g.businessHours !== undefined)    upd.businessHours = g.businessHours as any;
    }

    if (data.delivery) {
      const d = data.delivery as DeliverySettingsDto;
      // AFTER (correct)
if (d.deliveryFee !== undefined)             upd.deliveryFeeCents = Math.round((d.deliveryFee ?? 0) * 100);
if (d.freeDeliveryMinimum !== undefined)     upd.freeDeliveryMinimumCents = Math.round((d.freeDeliveryMinimum ?? 0) * 100);

      if (d.estimatedDeliveryTime !== undefined)   upd.estimatedDeliveryTime = d.estimatedDeliveryTime;
      if (d.maxDeliveryRadius !== undefined)       upd.maxDeliveryRadiusKm = d.maxDeliveryRadius!;
      if (d.deliveryZones !== undefined)           upd.deliveryZones = d.deliveryZones as any;
    }

    if (data.payment)       upd.payment = data.payment as any;
    if (data.notifications) upd.notifications = data.notifications as any;

    if (data.system) {
      const s = data.system as SystemSettingsDto;
      if (s.maintenanceMode !== undefined)          upd.maintenanceMode = s.maintenanceMode!;
      if (s.allowRegistrations !== undefined)       upd.allowRegistrations = s.allowRegistrations!;
      if (s.requireEmailVerification !== undefined) upd.requireEmailVerification = s.requireEmailVerification!;
      if (s.sessionTimeout !== undefined)           upd.sessionTimeoutMinutes = s.sessionTimeout!;
      if (s.maxLoginAttempts !== undefined)         upd.maxLoginAttempts = s.maxLoginAttempts!;
      if (s.dataRetentionDays !== undefined)        upd.dataRetentionDays = s.dataRetentionDays!;
      if (s.backupFrequency !== undefined)          upd.backupFrequency = s.backupFrequency!;
      if (s.timezone !== undefined)                 upd.timezone = s.timezone!;
      if (s.language !== undefined)                 upd.language = s.language!;
      if (s.currency !== undefined)                 upd.currency = s.currency!;
    }

    return upd;
  }

  @Get()
  @ApiOkResponse({ description: 'Full settings payload (sectioned for the UI)' })
  async get() {
    const s = await this.getOrCreate();
    return this.toUi(s);
  }

  @Patch()
  @ApiOkResponse({ description: 'Partial update, accept any sections' })
  async update(@Body() dto: UpdateSettingsDto) {
    const s = await this.getOrCreate();
    const data = this.toUpdate(dto);
    const updated = await this.svc.prisma.setting.update({ where: { id: s.id }, data });
    return this.toUi(updated);
  }

  // Optional: dedicated section endpoints (useful for the Save buttons per tab)

  @Patch('general')
  async updateGeneral(@Body() dto: GeneralSettingsDto) {
    return this.update({ general: dto });
  }

  @Patch('delivery')
  async updateDelivery(@Body() dto: DeliverySettingsDto) {
    return this.update({ delivery: dto });
  }

  @Patch('payment')
  async updatePayment(@Body() dto: PaymentSettingsDto) {
    return this.update({ payment: dto });
  }

  @Patch('notifications')
  async updateNotifications(@Body() dto: NotificationsSettingsDto) {
    return this.update({ notifications: dto });
  }

  @Patch('system')
  async updateSystem(@Body() dto: SystemSettingsDto) {
    return this.update({ system: dto });
  }
}
