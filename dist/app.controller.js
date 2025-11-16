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
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const error_codes_1 = require("./common/docs/error-codes");
let AppController = class AppController {
    ping() {
        return { status: 'ok', timestamp: new Date().toISOString() };
    }
    errorCodes() {
        return error_codes_1.ERROR_CODES;
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Healthcheck payload',
        schema: {
            type: 'object',
            properties: {
                status: { type: 'string', example: 'ok' },
                timestamp: { type: 'string', format: 'date-time' },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "ping", null);
__decorate([
    (0, common_1.Get)('error-codes'),
    (0, swagger_1.ApiOkResponse)({
        description: 'List of shared API error codes',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "errorCodes", null);
exports.AppController = AppController = __decorate([
    (0, swagger_1.ApiTags)('System'),
    (0, common_1.Controller)({ path: 'system', version: ['1', '2'] })
], AppController);
//# sourceMappingURL=app.controller.js.map