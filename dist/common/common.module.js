"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommonModule = void 0;
const common_1 = require("@nestjs/common");
const audit_log_service_1 = require("./audit/audit-log.service");
const request_context_service_1 = require("./context/request-context.service");
const cache_invalidation_service_1 = require("./cache/cache-invalidation.service");
const cache_service_1 = require("./cache/cache.service");
const response_interceptor_1 = require("./interceptors/response.interceptor");
const all_exceptions_filter_1 = require("./filters/all-exceptions.filter");
const slug_service_1 = require("./slug/slug.service");
let CommonModule = class CommonModule {
};
exports.CommonModule = CommonModule;
exports.CommonModule = CommonModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            audit_log_service_1.AuditLogService,
            request_context_service_1.RequestContextService,
            cache_invalidation_service_1.CacheInvalidationService,
            cache_service_1.CacheService,
            response_interceptor_1.ResponseInterceptor,
            all_exceptions_filter_1.AllExceptionsFilter,
            slug_service_1.SlugService,
        ],
        exports: [
            audit_log_service_1.AuditLogService,
            request_context_service_1.RequestContextService,
            cache_invalidation_service_1.CacheInvalidationService,
            cache_service_1.CacheService,
            response_interceptor_1.ResponseInterceptor,
            all_exceptions_filter_1.AllExceptionsFilter,
            slug_service_1.SlugService,
        ],
    })
], CommonModule);
//# sourceMappingURL=common.module.js.map