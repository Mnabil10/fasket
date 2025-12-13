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
exports.AdminOpsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const orders_stuck_watcher_1 = require("../orders/orders-stuck.watcher");
let AdminOpsController = class AdminOpsController {
    constructor(stuckWatcher) {
        this.stuckWatcher = stuckWatcher;
    }
    status() {
        return {
            watchers: {
                ordersStuck: this.stuckWatcher.getStatus?.() ?? { enabled: false },
            },
        };
    }
};
exports.AdminOpsController = AdminOpsController;
__decorate([
    (0, common_1.Get)('watchers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], AdminOpsController.prototype, "status", null);
exports.AdminOpsController = AdminOpsController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Ops'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/ops', version: ['1'] }),
    __metadata("design:paramtypes", [orders_stuck_watcher_1.OrdersStuckWatcher])
], AdminOpsController);
//# sourceMappingURL=ops.controller.js.map