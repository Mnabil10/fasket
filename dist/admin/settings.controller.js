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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const settings_dto_1 = require("./dto/settings.dto");
let AdminSettingsController = class AdminSettingsController {
    constructor(svc) {
        this.svc = svc;
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
                upd.deliveryZones = d.deliveryZones;
        }
        if (data.payment)
            upd.payment = data.payment;
        if (data.notifications)
            upd.notifications = data.notifications;
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
    async get() {
        const s = await this.getOrCreate();
        return this.toUi(s);
    }
    async update(dto) {
        const s = await this.getOrCreate();
        const data = this.toUpdate(dto);
        const updated = await this.svc.prisma.setting.update({ where: { id: s.id }, data });
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
    (0, common_1.Patch)('system'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.SystemSettingsDto]),
    __metadata("design:returntype", Promise)
], AdminSettingsController.prototype, "updateSystem", null);
exports.AdminSettingsController = AdminSettingsController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Settings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)('admin/settings'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminSettingsController);
//# sourceMappingURL=settings.controller.js.map