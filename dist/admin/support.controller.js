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
exports.AdminSupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const admin_service_1 = require("./admin.service");
const pagination_dto_1 = require("./dto/pagination.dto");
class SupportQueriesDto extends pagination_dto_1.PaginationDto {
}
let AdminSupportController = class AdminSupportController {
    constructor(svc) {
        this.svc = svc;
    }
    async list(query) {
        const where = {};
        if (query.intent)
            where.endpoint = query.intent;
        if (query.status)
            where.success = query.status.toUpperCase() === 'SUCCESS';
        if (query.phone)
            where.phoneMasked = { contains: query.phone, mode: 'insensitive' };
        if (query.code)
            where.orderCode = { contains: query.code, mode: 'insensitive' };
        const [items, total] = await this.svc.prisma.$transaction([
            this.svc.prisma.supportQueryAudit.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: query.skip,
                take: query.take,
            }),
            this.svc.prisma.supportQueryAudit.count({ where }),
        ]);
        const mapped = items.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            phone: row.phoneMasked ?? null,
            orderCode: row.orderCode ?? null,
            intent: row.endpoint,
            status: row.success ? 'SUCCESS' : 'FAILED',
            responseSnippet: row.responseSnippet ?? null,
            correlationId: row.correlationId,
        }));
        return {
            items: mapped,
            total,
            page: query.page ?? 1,
            pageSize: query.pageSize ?? query.limit ?? 20,
        };
    }
};
exports.AdminSupportController = AdminSupportController;
__decorate([
    (0, common_1.Get)('queries'),
    (0, swagger_1.ApiOkResponse)({ description: 'Support queries audit log' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SupportQueriesDto]),
    __metadata("design:returntype", Promise)
], AdminSupportController.prototype, "list", null);
exports.AdminSupportController = AdminSupportController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Support'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.StaffOrAdmin)(),
    (0, common_1.Controller)({ path: 'admin/support', version: ['1'] }),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminSupportController);
//# sourceMappingURL=support.controller.js.map