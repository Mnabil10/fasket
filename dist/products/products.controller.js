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
exports.ProductsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const products_service_1 = require("./products.service");
let ProductsController = class ProductsController {
    constructor(service) {
        this.service = service;
    }
    list(q, categoryId, min, max, lang) {
        return this.service.list({ q, categoryId, min: min ? Number(min) : undefined, max: max ? Number(max) : undefined, lang });
    }
    bestSelling(limit, lang) {
        return this.service.bestSelling(limit ? Number(limit) : 10, lang);
    }
    hotOffers(limit, lang) {
        return this.service.hotOffers(limit ? Number(limit) : 10, lang);
    }
    one(idOrSlug, lang) {
        return this.service.one(idOrSlug, lang);
    }
};
exports.ProductsController = ProductsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'categoryId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'min', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'max', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('categoryId')),
    __param(2, (0, common_1.Query)('min')),
    __param(3, (0, common_1.Query)('max')),
    __param(4, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('public/best-selling'),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, schema: { type: 'integer', default: 10 } }),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "bestSelling", null);
__decorate([
    (0, common_1.Get)('public/hot-offers'),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, schema: { type: 'integer', default: 10 } }),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "hotOffers", null);
__decorate([
    (0, common_1.Get)(':idOrSlug'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Param)('idOrSlug')),
    __param(1, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "one", null);
exports.ProductsController = ProductsController = __decorate([
    (0, swagger_1.ApiTags)('Products'),
    (0, common_1.Controller)('products'),
    __metadata("design:paramtypes", [products_service_1.ProductsService])
], ProductsController);
//# sourceMappingURL=products.controller.js.map