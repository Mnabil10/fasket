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
exports.CartController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const cart_service_1 = require("./cart.service");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const dto_1 = require("./dto");
let CartController = class CartController {
    constructor(service) {
        this.service = service;
    }
    get(user, lang) {
        return this.service.get(user.userId, lang);
    }
    add(user, dto, lang) {
        return this.service.add(user.userId, dto, lang);
    }
    applyCoupon(user, dto, lang) {
        return this.service.applyCoupon(user.userId, dto, lang);
    }
    update(user, id, dto, lang) {
        return this.service.updateQty(user.userId, id, dto.qty, lang);
    }
    remove(user, id, lang) {
        return this.service.remove(user.userId, id, lang);
    }
};
exports.CartController = CartController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('lang', new common_1.ParseEnumPipe(['en', 'ar'], { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('items'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('lang', new common_1.ParseEnumPipe(['en', 'ar'], { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.AddToCartDto, String]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "add", null);
__decorate([
    (0, common_1.Post)('apply-coupon'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('lang', new common_1.ParseEnumPipe(['en', 'ar'], { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.ApplyCouponDto, String]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "applyCoupon", null);
__decorate([
    (0, common_1.Patch)('items/:id'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Query)('lang', new common_1.ParseEnumPipe(['en', 'ar'], { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.UpdateCartItemDto, String]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('items/:id'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('lang', new common_1.ParseEnumPipe(['en', 'ar'], { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "remove", null);
exports.CartController = CartController = __decorate([
    (0, swagger_1.ApiTags)('Cart'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)({ path: 'cart', version: ['1', '2'] }),
    __metadata("design:paramtypes", [cart_service_1.CartService])
], CartController);
//# sourceMappingURL=cart.controller.js.map