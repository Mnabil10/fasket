"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const products_controller_1 = require("./products.controller");
const categories_controller_1 = require("./categories.controller");
const orders_controller_1 = require("./orders.controller");
const customers_controller_1 = require("./customers.controller");
const settings_controller_1 = require("./settings.controller");
const dashboard_controller_1 = require("./dashboard.controller");
const admin_service_1 = require("./admin.service");
const coupons_controller_1 = require("./coupons.controller");
const uploads_module_1 = require("../uploads/uploads.module");
const products_bulk_service_1 = require("./products-bulk.service");
const delivery_drivers_controller_1 = require("./delivery-drivers.controller");
const delivery_drivers_module_1 = require("../delivery-drivers/delivery-drivers.module");
const notifications_module_1 = require("../notifications/notifications.module");
const orders_module_1 = require("../orders/orders.module");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            products_controller_1.AdminProductsController,
            categories_controller_1.AdminCategoriesController,
            orders_controller_1.AdminOrdersController,
            customers_controller_1.AdminCustomersController,
            settings_controller_1.AdminSettingsController,
            dashboard_controller_1.AdminDashboardController,
            coupons_controller_1.AdminCouponsController,
            delivery_drivers_controller_1.AdminDeliveryDriversController,
        ],
        imports: [
            uploads_module_1.UploadsModule,
            notifications_module_1.NotificationsModule,
            orders_module_1.OrdersModule,
            delivery_drivers_module_1.DeliveryDriversModule,
        ],
        providers: [admin_service_1.AdminService, products_bulk_service_1.ProductsBulkService],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map