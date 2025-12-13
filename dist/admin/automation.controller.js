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
exports.AdminAutomationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const _admin_guards_1 = require("./_admin-guards");
const prisma_service_1 = require("../prisma/prisma.service");
const automation_events_service_1 = require("../automation/automation-events.service");
const client_1 = require("@prisma/client");
class AutomationEventsQuery {
}
class AutomationReplayDto {
}
let AdminAutomationController = class AdminAutomationController {
    constructor(prisma, automation) {
        this.prisma = prisma;
        this.automation = automation;
    }
    async list(query) {
        const rawPageSize = query.pageSize ?? query.limit;
        const pageSize = Math.min(Math.max(Number(rawPageSize) || 20, 1), 200);
        const page = Math.max(Number(query.page) || 1, 1);
        const where = {};
        if (query.status)
            where.status = query.status;
        if (query.type)
            where.type = query.type;
        if (query.from || query.to)
            where.createdAt = {};
        if (query.from)
            where.createdAt.gte = new Date(query.from);
        if (query.to)
            where.createdAt.lte = new Date(query.to);
        const [items, total] = await this.prisma.$transaction([
            this.prisma.automationEvent.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.automationEvent.count({ where }),
        ]);
        const aggregates = await this.aggregateCounts();
        return { items, total, page, pageSize, aggregates };
    }
    async replay(dto) {
        const where = {
            status: { in: [client_1.AutomationEventStatus.FAILED, client_1.AutomationEventStatus.DEAD] },
        };
        if (dto.status)
            where.status = dto.status;
        if (dto.type)
            where.type = dto.type;
        if (dto.from || dto.to)
            where.createdAt = {};
        if (dto.from)
            where.createdAt.gte = new Date(dto.from);
        if (dto.to)
            where.createdAt.lte = new Date(dto.to);
        const limit = Math.min(dto.limit ?? 50, 200);
        const events = await this.prisma.automationEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true },
        });
        await this.prisma.automationEvent.updateMany({
            where: { id: { in: events.map((e) => e.id) } },
            data: { status: client_1.AutomationEventStatus.PENDING, nextAttemptAt: new Date(), lastError: null },
        });
        await this.automation.enqueueMany(events);
        return { success: true, replayed: events.length };
    }
    async aggregateCounts() {
        const statuses = await this.prisma.automationEvent.groupBy({
            by: ['status'],
            _count: { _all: true },
        });
        return {
            pendingCount: statuses.find((s) => s.status === client_1.AutomationEventStatus.PENDING)?._count?._all ?? 0,
            failedCount: statuses.find((s) => s.status === client_1.AutomationEventStatus.FAILED)?._count?._all ?? 0,
            deadCount: statuses.find((s) => s.status === client_1.AutomationEventStatus.DEAD)?._count?._all ?? 0,
            sentCount: statuses.find((s) => s.status === client_1.AutomationEventStatus.SENT)?._count?._all ?? 0,
        };
    }
};
exports.AdminAutomationController = AdminAutomationController;
__decorate([
    (0, common_1.Get)('events'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AutomationEventsQuery]),
    __metadata("design:returntype", Promise)
], AdminAutomationController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('replay'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AutomationReplayDto]),
    __metadata("design:returntype", Promise)
], AdminAutomationController.prototype, "replay", null);
exports.AdminAutomationController = AdminAutomationController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Automation'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/automation', version: ['1'] }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        automation_events_service_1.AutomationEventsService])
], AdminAutomationController);
//# sourceMappingURL=automation.controller.js.map