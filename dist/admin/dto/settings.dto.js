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
exports.UpdateSettingsDto = exports.SystemSettingsDto = exports.NotificationsSettingsDto = exports.PaymentSettingsDto = exports.DeliverySettingsDto = exports.GeneralSettingsDto = exports.NotificationsDto = exports.AdminAlertsDto = exports.LowStockAlertDto = exports.MarketingEmailsDto = exports.OrderNotificationsDto = exports.PaymentDto = exports.StripeDto = exports.DigitalWalletsDto = exports.WalletConfigDto = exports.CreditCardsDto = exports.CashOnDeliveryDto = exports.DeliveryZoneDto = exports.BusinessHoursDto = exports.DayHoursDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class DayHoursDto {
}
exports.DayHoursDto = DayHoursDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DayHoursDto.prototype, "open", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DayHoursDto.prototype, "close", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DayHoursDto.prototype, "enabled", void 0);
class BusinessHoursDto {
}
exports.BusinessHoursDto = BusinessHoursDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "monday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "tuesday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "wednesday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "thursday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "friday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "saturday", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DayHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DayHoursDto),
    __metadata("design:type", DayHoursDto)
], BusinessHoursDto.prototype, "sunday", void 0);
class DeliveryZoneDto {
}
exports.DeliveryZoneDto = DeliveryZoneDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeliveryZoneDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DeliveryZoneDto.prototype, "fee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeliveryZoneDto.prototype, "enabled", void 0);
class CashOnDeliveryDto {
}
exports.CashOnDeliveryDto = CashOnDeliveryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CashOnDeliveryDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CashOnDeliveryDto.prototype, "maxAmount", void 0);
class CreditCardsDto {
}
exports.CreditCardsDto = CreditCardsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreditCardsDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], CreditCardsDto.prototype, "acceptedCards", void 0);
class WalletConfigDto {
}
exports.WalletConfigDto = WalletConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], WalletConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WalletConfigDto.prototype, "merchantId", void 0);
class DigitalWalletsDto {
}
exports.DigitalWalletsDto = DigitalWalletsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => WalletConfigDto),
    __metadata("design:type", WalletConfigDto)
], DigitalWalletsDto.prototype, "paypal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => WalletConfigDto),
    __metadata("design:type", WalletConfigDto)
], DigitalWalletsDto.prototype, "applePay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => WalletConfigDto),
    __metadata("design:type", WalletConfigDto)
], DigitalWalletsDto.prototype, "googlePay", void 0);
class StripeDto {
}
exports.StripeDto = StripeDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], StripeDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StripeDto.prototype, "publicKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StripeDto.prototype, "secretKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StripeDto.prototype, "webhookSecret", void 0);
class PaymentDto {
}
exports.PaymentDto = PaymentDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CashOnDeliveryDto),
    __metadata("design:type", CashOnDeliveryDto)
], PaymentDto.prototype, "cashOnDelivery", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CreditCardsDto),
    __metadata("design:type", CreditCardsDto)
], PaymentDto.prototype, "creditCards", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DigitalWalletsDto),
    __metadata("design:type", DigitalWalletsDto)
], PaymentDto.prototype, "digitalWallets", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StripeDto),
    __metadata("design:type", StripeDto)
], PaymentDto.prototype, "stripe", void 0);
class OrderNotificationsDto {
}
exports.OrderNotificationsDto = OrderNotificationsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], OrderNotificationsDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], OrderNotificationsDto.prototype, "sms", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], OrderNotificationsDto.prototype, "push", void 0);
class MarketingEmailsDto {
}
exports.MarketingEmailsDto = MarketingEmailsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], MarketingEmailsDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MarketingEmailsDto.prototype, "frequency", void 0);
class LowStockAlertDto {
}
exports.LowStockAlertDto = LowStockAlertDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], LowStockAlertDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], LowStockAlertDto.prototype, "threshold", void 0);
class AdminAlertsDto {
}
exports.AdminAlertsDto = AdminAlertsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => LowStockAlertDto),
    __metadata("design:type", LowStockAlertDto)
], AdminAlertsDto.prototype, "lowStock", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], AdminAlertsDto.prototype, "newOrders", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], AdminAlertsDto.prototype, "systemUpdates", void 0);
class NotificationsDto {
}
exports.NotificationsDto = NotificationsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OrderNotificationsDto),
    __metadata("design:type", OrderNotificationsDto)
], NotificationsDto.prototype, "orderNotifications", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MarketingEmailsDto),
    __metadata("design:type", MarketingEmailsDto)
], NotificationsDto.prototype, "marketingEmails", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdminAlertsDto),
    __metadata("design:type", AdminAlertsDto)
], NotificationsDto.prototype, "adminAlerts", void 0);
class GeneralSettingsDto {
}
exports.GeneralSettingsDto = GeneralSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneralSettingsDto.prototype, "storeName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneralSettingsDto.prototype, "storeDescription", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], GeneralSettingsDto.prototype, "contactEmail", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneralSettingsDto.prototype, "contactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneralSettingsDto.prototype, "storeAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: BusinessHoursDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => BusinessHoursDto),
    __metadata("design:type", BusinessHoursDto)
], GeneralSettingsDto.prototype, "businessHours", void 0);
class DeliverySettingsDto {
}
exports.DeliverySettingsDto = DeliverySettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DeliverySettingsDto.prototype, "deliveryFee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DeliverySettingsDto.prototype, "freeDeliveryMinimum", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeliverySettingsDto.prototype, "estimatedDeliveryTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeliverySettingsDto.prototype, "maxDeliveryRadius", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [DeliveryZoneDto] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => DeliveryZoneDto),
    __metadata("design:type", Array)
], DeliverySettingsDto.prototype, "deliveryZones", void 0);
class PaymentSettingsDto extends PaymentDto {
}
exports.PaymentSettingsDto = PaymentSettingsDto;
class NotificationsSettingsDto extends NotificationsDto {
}
exports.NotificationsSettingsDto = NotificationsSettingsDto;
class SystemSettingsDto {
}
exports.SystemSettingsDto = SystemSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SystemSettingsDto.prototype, "maintenanceMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SystemSettingsDto.prototype, "allowRegistrations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SystemSettingsDto.prototype, "requireEmailVerification", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], SystemSettingsDto.prototype, "sessionTimeout", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], SystemSettingsDto.prototype, "maxLoginAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], SystemSettingsDto.prototype, "dataRetentionDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SystemSettingsDto.prototype, "backupFrequency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SystemSettingsDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SystemSettingsDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SystemSettingsDto.prototype, "currency", void 0);
class UpdateSettingsDto {
}
exports.UpdateSettingsDto = UpdateSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: GeneralSettingsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => GeneralSettingsDto),
    __metadata("design:type", GeneralSettingsDto)
], UpdateSettingsDto.prototype, "general", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DeliverySettingsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeliverySettingsDto),
    __metadata("design:type", DeliverySettingsDto)
], UpdateSettingsDto.prototype, "delivery", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: PaymentSettingsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PaymentSettingsDto),
    __metadata("design:type", PaymentSettingsDto)
], UpdateSettingsDto.prototype, "payment", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: NotificationsSettingsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => NotificationsSettingsDto),
    __metadata("design:type", NotificationsSettingsDto)
], UpdateSettingsDto.prototype, "notifications", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: SystemSettingsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SystemSettingsDto),
    __metadata("design:type", SystemSettingsDto)
], UpdateSettingsDto.prototype, "system", void 0);
//# sourceMappingURL=settings.dto.js.map