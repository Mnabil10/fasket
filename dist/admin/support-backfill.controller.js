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
exports.SupportBackfillController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const prisma_service_1 = require("../prisma/prisma.service");
let SupportBackfillController = class SupportBackfillController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async backfill(batch = '500') {
        const take = Math.min(Math.max(Number(batch) || 500, 1), 2000);
        const rows = await this.prisma.supportQueryAudit.findMany({
            where: {
                OR: [{ phoneMasked: null }, { orderCode: null }],
            },
            select: { id: true, phoneHash: true, phoneMasked: true, orderCode: true },
            take,
        });
        for (const row of rows) {
            await this.prisma.supportQueryAudit.update({
                where: { id: row.id },
                data: {
                    phoneMasked: row.phoneMasked ?? (row.phoneHash ? 'masked' : 'unknown'),
                    orderCode: row.orderCode ?? null,
                },
            });
        }
        return { success: true, processed: rows.length, remaining: rows.length < take ? 0 : 'more' };
    }
};
exports.SupportBackfillController = SupportBackfillController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Query)('batch')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SupportBackfillController.prototype, "backfill", null);
exports.SupportBackfillController = SupportBackfillController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Support'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/support/backfill', version: ['1'] }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SupportBackfillController);
//# sourceMappingURL=support-backfill.controller.js.map