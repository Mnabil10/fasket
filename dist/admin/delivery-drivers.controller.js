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
exports.AdminDeliveryDriversController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const delivery_drivers_service_1 = require("../delivery-drivers/delivery-drivers.service");
const driver_dto_1 = require("../delivery-drivers/dto/driver.dto");
let AdminDeliveryDriversController = class AdminDeliveryDriversController {
    constructor(drivers) {
        this.drivers = drivers;
    }
    list(search, isActive, page, pageSize) {
        return this.drivers.list({
            search,
            isActive: isActive === undefined ? undefined : isActive === 'true',
            page,
            pageSize,
        });
    }
    get(id) {
        return this.drivers.getById(id);
    }
    create(dto) {
        return this.drivers.create(dto);
    }
    update(id, dto) {
        return this.drivers.update(id, dto);
    }
    updateStatus(id, dto) {
        return this.drivers.updateStatus(id, dto);
    }
    upsertVehicle(id, dto) {
        return this.drivers.upsertVehicle(id, dto);
    }
};
exports.AdminDeliveryDriversController = AdminDeliveryDriversController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number }),
    __param(0, (0, common_1.Query)('search')),
    __param(1, (0, common_1.Query)('isActive')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [driver_dto_1.CreateDriverDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpdateDriverDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpdateDriverStatusDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/vehicle'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, driver_dto_1.UpsertVehicleDto]),
    __metadata("design:returntype", void 0)
], AdminDeliveryDriversController.prototype, "upsertVehicle", null);
exports.AdminDeliveryDriversController = AdminDeliveryDriversController = __decorate([
    (0, swagger_1.ApiTags)('Admin/DeliveryDrivers'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/delivery-drivers', version: ['1'] }),
    __metadata("design:paramtypes", [delivery_drivers_service_1.DeliveryDriversService])
], AdminDeliveryDriversController);
//# sourceMappingURL=delivery-drivers.controller.js.map