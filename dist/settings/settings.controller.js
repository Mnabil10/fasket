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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const settings_service_1 = require("./settings.service");
let SettingsController = class SettingsController {
    constructor(settings) {
        this.settings = settings;
    }
    async getActiveDeliveryZones() {
        const zones = await this.settings.getActiveDeliveryZones();
        return zones;
    }
    async getAppSettings() {
        const [settings, delivery, loyalty] = await Promise.all([
            this.settings.getSettings(),
            this.settings.getDeliveryConfig(),
            this.settings.getLoyaltyConfig(),
        ]);
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
            delivery,
            loyalty,
            payment: settings.payment ?? undefined,
            notifications: settings.notifications ?? undefined,
            businessHours: settings.businessHours ?? undefined,
        };
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)('delivery-zones'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getActiveDeliveryZones", null);
__decorate([
    (0, common_1.Get)('app'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getAppSettings", null);
exports.SettingsController = SettingsController = __decorate([
    (0, swagger_1.ApiTags)('Settings'),
    (0, common_1.Controller)({ path: 'settings', version: ['1'] }),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
//# sourceMappingURL=settings.controller.js.map