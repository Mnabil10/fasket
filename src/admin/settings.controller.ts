import { Body, Controller, Get, Logger, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import {
  UpdateSettingsDto,
  GeneralSettingsDto, DeliverySettingsDto, PaymentSettingsDto,
  NotificationsSettingsDto, SystemSettingsDto, LoyaltySettingsDto,
} from './dto/settings.dto';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { DeliveryZone } from '../settings/settings.types';
import { DomainError, ErrorCode } from '../common/errors';

@ApiTags('Admin/Settings')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/settings', version: ['1'] })
export class AdminSettingsController {
  private readonly logger = new Logger(AdminSettingsController.name);
  constructor(
    private readonly svc: AdminService,
    private readonly settingsService: SettingsService,
  ) {}

  private async getOrCreate() {
    const found = await this.svc.prisma.setting.findFirst();
    if (found) return found;
    // Ensure EGP default if creating the first settings row
    return this.svc.prisma.setting.create({ data: { currency: 'EGP' } });
  }

  /** Transform DB -> UI */
  private toUi(setting: any, zones?: DeliveryZone[]) {
    const deliveryZones = zones ?? this.settingsService.deserializeDeliveryZones(setting.deliveryZones);
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
        deliveryZones: deliveryZones.map((zone) => ({
          id: zone.id,
          nameEn: zone.nameEn,
          nameAr: zone.nameAr,
          city: (zone as any).city,
          region: (zone as any).region,
          fee: zone.feeCents / 100,
          feeCents: zone.feeCents,
          etaMinutes: zone.etaMinutes,
          freeDeliveryThresholdCents: (zone as any).freeDeliveryThresholdCents,
          minOrderAmountCents: (zone as any).minOrderAmountCents,
          isActive: zone.isActive,
        })),
      },
      payment: setting.payment ?? {},
      notifications: setting.notifications ?? {},
      loyalty: {
        enabled: setting.loyaltyEnabled,
        earnPoints: setting.loyaltyEarnPoints,
        earnPerCents: setting.loyaltyEarnPerCents,
        redeemRate: setting.loyaltyRedeemRate,
        redeemUnitCents: setting.loyaltyRedeemUnitCents,
        minRedeemPoints: setting.loyaltyMinRedeemPoints,
        maxDiscountPercent: setting.loyaltyMaxDiscountPercent,
        maxRedeemPerOrder: setting.loyaltyMaxRedeemPerOrder,
        resetThreshold: setting.loyaltyResetThreshold,
        earnRate: setting.loyaltyEarnRate,
        redeemRateValue: setting.loyaltyRedeemRateValue,
      },
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
      const toNonNegativeInt = (value: any) => {
        const num = Number(value ?? 0);
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, Math.round(num));
      };
      // Prefer cents fields if provided; otherwise use float fields converted to cents
      if (d.deliveryFeeCents !== undefined) {
        upd.deliveryFeeCents = toNonNegativeInt(d.deliveryFeeCents);
      } else if (d.deliveryFee !== undefined) {
        upd.deliveryFeeCents = toNonNegativeInt((d.deliveryFee ?? 0) * 100);
      }
      if (d.freeDeliveryMinimumCents !== undefined) {
        upd.freeDeliveryMinimumCents = toNonNegativeInt(d.freeDeliveryMinimumCents);
      } else if (d.freeDeliveryMinimum !== undefined) {
        upd.freeDeliveryMinimumCents = toNonNegativeInt((d.freeDeliveryMinimum ?? 0) * 100);
      }

      if (d.estimatedDeliveryTime !== undefined)   upd.estimatedDeliveryTime = d.estimatedDeliveryTime;
      if (d.maxDeliveryRadius !== undefined)       upd.maxDeliveryRadiusKm = d.maxDeliveryRadius!;
    }

    if (data.payment)       upd.payment = data.payment as any;
    if (data.notifications) upd.notifications = data.notifications as any;
    if (data.loyalty) {
      const l = data.loyalty as any;
      if (l.enabled !== undefined) upd.loyaltyEnabled = l.enabled;
      if (l.earnPoints !== undefined) upd.loyaltyEarnPoints = l.earnPoints;
      if (l.earnPerCents !== undefined) upd.loyaltyEarnPerCents = l.earnPerCents;
      if (l.redeemRate !== undefined) upd.loyaltyRedeemRate = l.redeemRate;
      if (l.redeemUnitCents !== undefined) upd.loyaltyRedeemUnitCents = l.redeemUnitCents;
      if (l.minRedeemPoints !== undefined) upd.loyaltyMinRedeemPoints = l.minRedeemPoints;
      if (l.maxDiscountPercent !== undefined) upd.loyaltyMaxDiscountPercent = l.maxDiscountPercent;
      if (l.maxRedeemPerOrder !== undefined) upd.loyaltyMaxRedeemPerOrder = l.maxRedeemPerOrder;
      if (l.resetThreshold !== undefined) upd.loyaltyResetThreshold = l.resetThreshold;
      if (l.earnRate !== undefined) upd.loyaltyEarnRate = l.earnRate;
      if (l.redeemRateValue !== undefined) upd.loyaltyRedeemRateValue = l.redeemRateValue;
    }

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

  private transformDeliveryZones(zones?: DeliverySettingsDto['deliveryZones']): DeliveryZone[] | undefined {
    if (!zones) return undefined;
    const seen = new Set<string>();
    const normalized: DeliveryZone[] = zones.map((zone) => {
      const id = zone.id?.trim();
      if (!id) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Delivery zone id is required');
      }
      if (seen.has(id)) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, `Duplicate delivery zone id "${id}"`);
      }
      seen.add(id);
      const nameEn = zone.nameEn?.trim();
      if (!nameEn) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, `Delivery zone "${id}" requires an English name`);
      }
      const nameAr = zone.nameAr?.trim() ?? '';
      const feeRaw = (zone as any).feeCents ?? zone.fee ?? 0;
      const feeCents =
        (zone as any).feeCents !== undefined
          ? Math.max(0, Math.round(Number((zone as any).feeCents)))
          : Math.max(0, Math.round(Number(feeRaw) * 100));
      const etaMinutes =
        zone.etaMinutes === undefined || zone.etaMinutes === null
          ? undefined
          : Math.max(0, Math.round(Number(zone.etaMinutes)));
      return {
        id,
        nameEn,
        nameAr,
        city: (zone as any).city ?? undefined,
        region: (zone as any).region ?? undefined,
        feeCents,
        etaMinutes,
        freeDeliveryThresholdCents:
          (zone as any).freeDeliveryThresholdCents === undefined
            ? undefined
            : Math.max(0, Math.round(Number((zone as any).freeDeliveryThresholdCents ?? 0))),
        minOrderAmountCents:
          (zone as any).minOrderAmountCents === undefined
            ? undefined
            : Math.max(0, Math.round(Number((zone as any).minOrderAmountCents ?? 0))),
        isActive: zone.isActive ?? true,
      };
    });
    return normalized;
  }

  @Get()
  @ApiOkResponse({ description: 'Full settings payload (sectioned for the UI)' })
  async get() {
    const s = await this.getOrCreate();
    const zones = await this.settingsService.getDeliveryZones({ includeInactive: true });
    return this.toUi(s, zones);
  }

  @Patch()
  @ApiOkResponse({ description: 'Partial update, accept any sections' })
  async update(@Body() dto: UpdateSettingsDto) {
    const s = await this.getOrCreate();
    if (dto.delivery?.deliveryZones) {
      const zones = this.transformDeliveryZones(dto.delivery.deliveryZones);
      if (zones) {
        await this.settingsService.replaceZones(zones);
      }
    }
    const data = this.toUpdate(dto);
    const updated = await this.svc.prisma.setting.update({ where: { id: s.id }, data });
    this.logger.log({ msg: 'Settings updated', settingId: s.id });
    await this.settingsService.clearCache();
    const zones = await this.settingsService.getDeliveryZones({ includeInactive: true });
    return this.toUi(updated, zones);
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

  @Patch('loyalty')
  async updateLoyalty(@Body() dto: LoyaltySettingsDto) {
    return this.update({ loyalty: dto });
  }

  @Patch('system')
  async updateSystem(@Body() dto: SystemSettingsDto) {
    return this.update({ system: dto });
  }
}
