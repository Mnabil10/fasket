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
const lang_normalize_pipe_1 = require("../common/pipes/lang-normalize.pipe");
const public_product_query_dto_1 = require("./dto/public-product-query.dto");
let ProductsController = class ProductsController {
    constructor(service) {
        this.service = service;
    }
    list(query) {
        return this.service.list(query);
    }
    bestSelling(query) {
        return this.service.bestSelling(query);
    }
    hotOffers(query) {
        return this.service.hotOffers(query);
    }
    one(idOrSlug, lang) {
        return this.service.one(idOrSlug, lang);
    }
};
exports.ProductsController = ProductsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [public_product_query_dto_1.PublicProductListDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('public/best-selling'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [public_product_query_dto_1.PublicProductFeedDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "bestSelling", null);
__decorate([
    (0, common_1.Get)('public/hot-offers'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [public_product_query_dto_1.PublicProductFeedDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "hotOffers", null);
__decorate([
    (0, common_1.Get)(':idOrSlug'),
    (0, swagger_1.ApiQuery)({ name: 'lang', required: false, enum: ['en', 'ar'] }),
    __param(0, (0, common_1.Param)('idOrSlug')),
    __param(1, (0, common_1.Query)('lang', lang_normalize_pipe_1.LangNormalizePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "one", null);
exports.ProductsController = ProductsController = __decorate([
    (0, swagger_1.ApiTags)('Products'),
    (0, common_1.Controller)({ path: 'products', version: ['1', '2'] }),
    __metadata("design:paramtypes", [products_service_1.ProductsService])
], ProductsController);
//# sourceMappingURL=products.controller.js.map