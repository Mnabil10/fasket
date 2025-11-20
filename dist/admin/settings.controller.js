"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AdminSettingsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const settings_dto_1 = require("./dto/settings.dto");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
let AdminSettingsController = AdminSettingsController_1 = class AdminSettingsController {
    constructor(svc, settingsService) {
        this.svc = svc;
        this.settingsService = settingsService;
        this.logger = new common_1.Logger(AdminSettingsController_1.name);
    }
    async getOrCreate() {
        const found = await this.svc.prisma.setting.findFirst();
        if (found)
            return found;
        return this.svc.prisma.setting.create({ data: { currency: 'EGP' } });
    }
    toUi(setting) {
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
                deliveryZones: this.settingsService.deserializeDeliveryZones(setting.deliveryZones).map((zone) => ({
                    id: zone.id,
                    nameEn: zone.nameEn,
                    nameAr: zone.nameAr,
                    fee: zone.feeCents / 100,
                    feeCents: zone.feeCents,
                    etaMinutes: zone.etaMinutes,
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
    toUpdate(data) {
        const upd = {};
        if (data.general) {
            const g = data.general;
            if (g.storeName !== undefined)
                upd.storeName = g.storeName;
            if (g.storeDescription !== undefined)
                upd.storeDescription = g.storeDescription;
            if (g.contactEmail !== undefined)
                upd.contactEmail = g.contactEmail;
            if (g.contactPhone !== undefined)
                upd.contactPhone = g.contactPhone;
            if (g.storeAddress !== undefined)
                upd.storeAddress = g.storeAddress;
            if (g.businessHours !== undefined)
                upd.businessHours = g.businessHours;
        }
        if (data.delivery) {
            const d = data.delivery;
            if (d.deliveryFee !== undefined)
                upd.deliveryFeeCents = Math.round((d.deliveryFee ?? 0) * 100);
            if (d.freeDeliveryMinimum !== undefined)
                upd.freeDeliveryMinimumCents = Math.round((d.freeDeliveryMinimum ?? 0) * 100);
            if (d.estimatedDeliveryTime !== undefined)
                upd.estimatedDeliveryTime = d.estimatedDeliveryTime;
            if (d.maxDeliveryRadius !== undefined)
                upd.maxDeliveryRadiusKm = d.maxDeliveryRadius;
            if (d.deliveryZones !== undefined)
                upd.deliveryZones = this.transformDeliveryZones(d.deliveryZones);
        }
        if (data.payment)
            upd.payment = data.payment;
        if (data.notifications)
            upd.notifications = data.notifications;
        if (data.loyalty) {
            const l = data.loyalty;
            if (l.enabled !== undefined)
                upd.loyaltyEnabled = l.enabled;
            if (l.earnPoints !== undefined)
                upd.loyaltyEarnPoints = l.earnPoints;
            if (l.earnPerCents !== undefined)
                upd.loyaltyEarnPerCents = l.earnPerCents;
            if (l.redeemRate !== undefined)
                upd.loyaltyRedeemRate = l.redeemRate;
            if (l.redeemUnitCents !== undefined)
                upd.loyaltyRedeemUnitCents = l.redeemUnitCents;
            if (l.minRedeemPoints !== undefined)
                upd.loyaltyMinRedeemPoints = l.minRedeemPoints;
            if (l.maxDiscountPercent !== undefined)
                upd.loyaltyMaxDiscountPercent = l.maxDiscountPercent;
            if (l.maxRedeemPerOrder !== undefined)
                upd.loyaltyMaxRedeemPerOrder = l.maxRedeemPerOrder;
            if (l.resetThreshold !== undefined)
                upd.loyaltyResetThreshold = l.resetThreshold;
            if (l.earnRate !== undefined)
                upd.loyaltyEarnRate = l.earnRate;
            if (l.redeemRateValue !== undefined)
                upd.loyaltyRedeemRateValue = l.redeemRateValue;
        }
        if (data.system) {
            const s = data.system;
            if (s.maintenanceMode !== undefined)
                upd.maintenanceMode = s.maintenanceMode;
            if (s.allowRegistrations !== undefined)
                upd.allowRegistrations = s.allowRegistrations;
            if (s.requireEmailVerification !== undefined)
                upd.requireEmailVerification = s.requireEmailVerification;
            if (s.sessionTimeout !== undefined)
                upd.sessionTimeoutMinutes = s.sessionTimeout;
            if (s.maxLoginAttempts !== undefined)
                upd.maxLoginAttempts = s.maxLoginAttempts;
            if (s.dataRetentionDays !== undefined)
                upd.dataRetentionDays = s.dataRetentionDays;
            if (s.backupFrequency !== undefined)
                upd.backupFrequency = s.backupFrequency;
            if (s.timezone !== undefined)
                upd.timezone = s.timezone;
            if (s.language !== undefined)
                upd.language = s.language;
            if (s.currency !== undefined)
                upd.currency = s.currency;
        }
        return upd;
    }
    transformDeliveryZones(zones) {
        if (!zones)
            return undefined;
        const seen = new Set();
        const normalized = zones.map((zone) => {
            const id = zone.id?.trim();
            if (!id) {
                throw new errors_1.DomainError(errors_1.ErrorCode.VALIDATION_FAILED, 'Delivery zone id is required');
            }
            if (seen.has(id)) {
                throw new errors_1.DomainError(errors_1.ErrorCode.VALIDATION_FAILED, `Duplicate delivery zone id "${id}"`);
            }
            seen.add(id);
            const nameEn = zone.nameEn?.trim();
            if (!nameEn) {
                throw new errors_1.DomainError(errors_1.ErrorCode.VALIDATION_FAILED, `Delivery zone "${id}" requires an English name`);
            }
            const nameAr = zone.nameAr?.trim() ?? '';
            const feeRaw = zone.feeCents ?? zone.fee ?? 0;
            const feeCents = zone.feeCents !== undefined
                ? Math.max(0, Math.round(Number(zone.feeCents)))
                : Math.max(0, Math.round(Number(feeRaw) * 100));
            const etaMinutes = zone.etaMinutes === undefined || zone.etaMinutes === null
                ? undefined
                : Math.max(0, Math.round(Number(zone.etaMinutes)));
            return {
                id,
                nameEn,
                nameAr,
                feeCents,
                etaMinutes,
                isActive: zone.isActive ?? true,
            };
        });
        return normalized;
    }
    async get() {
        const s = await this.getOrCreate();
        return this.toUi(s);
    }
    async update(dto) {
        const s = await this.getOrCreate();
        const data = this.toUpdate(dto);
        const updated = await this.svc.prisma.setting.update({ where: { id: s.id }, data });
        this.logger.log({ msg: 'Settings updated', settingId: s.id });
        await this.settingsService.clearCache();
        return this.toUi(updated);
    }
    async updateGeneral(dto) {
        return this.update({ general: dto });
    }
    async updateDelivery(dto) {
        return this.update({ delivery: dto });
    }
    async updatePayment(dto) {
        return this.update({ payment: dto });
    }
    async updateNotifications(dto) {
        return this.update({ notifications: dto });
    }
    async updateLoyalty(dto) {
        return this.update({ loyalty: dto });
    }
    async updateSystem(dto) {
        return this.update({ system: dto });
    }
};
exports.AdminSettingsController = AdminSettingsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Full settings payload (sectioned for the UI)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Partial update, accept any sections' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.UpdateSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)('general'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.GeneralSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateGeneral", null);
__decorate([
    (0, common_1.Patch)('delivery'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.DeliverySettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateDelivery", null);
__decorate([
    (0, common_1.Patch)('payment'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.PaymentSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updatePayment", null);
__decorate([
    (0, common_1.Patch)('notifications'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.NotificationsSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateNotifications", null);
__decorate([
    (0, common_1.Patch)('loyalty'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.LoyaltySettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateLoyalty", null);
__decorate([
    (0, common_1.Patch)('system'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.SystemSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateSystem", null);
exports.AdminSettingsController = AdminSettingsController = AdminSettingsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin/Settings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/settings', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        settings_service_1.SettingsService])
], AdminSettingsController);
//# sourceMappingURL=settings.controller.js.map