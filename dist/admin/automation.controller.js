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
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class AutomationEventsQuery {
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.AutomationEventStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.AutomationEventStatus),
    __metadata("design:type", String)
], AutomationEventsQuery.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Automation event type' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AutomationEventsQuery.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date string (inclusive)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AutomationEventsQuery.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date string (inclusive)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AutomationEventsQuery.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AutomationEventsQuery.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Page size; alias: limit', default: 20, minimum: 1, maximum: 200 }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], AutomationEventsQuery.prototype, "pageSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Alias for pageSize', minimum: 1, maximum: 200 }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], AutomationEventsQuery.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Search in correlationId, order code, phone or dedupe' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AutomationEventsQuery.prototype, "q", void 0);
class AutomationReplayDto {
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.AutomationEventStatus, description: 'Defaults to FAILED/DEAD when omitted' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.AutomationEventStatus),
    __metadata("design:type", String)
], AutomationReplayDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Automation event type' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AutomationReplayDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date string (inclusive)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AutomationReplayDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ISO date string (inclusive)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AutomationReplayDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 50, minimum: 1, maximum: 200 }),
    (0, class_transformer_1.Transform)(({ value }) => (value === undefined ? undefined : Number(value))),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], AutomationReplayDto.prototype, "limit", void 0);
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
        if (query.q) {
            const term = query.q.trim();
            where.OR = [
                { correlationId: { contains: term, mode: 'insensitive' } },
                { dedupeKey: { contains: term, mode: 'insensitive' } },
                { payload: { path: ['order_code'], string_contains: term } },
                { payload: { path: ['order_id'], string_contains: term } },
                { payload: { path: ['customer_phone'], string_contains: term } },
                { payload: { path: ['phone'], string_contains: term } },
            ];
        }
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
        return { items, total, page, pageSize, aggregates, counts: aggregates };
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
    async replaySingle(id) {
        const event = await this.prisma.automationEvent.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!event) {
            return { success: false, message: 'Event not found' };
        }
        const nextAttemptAt = new Date();
        await this.prisma.automationEvent.update({
            where: { id },
            data: { status: client_1.AutomationEventStatus.PENDING, nextAttemptAt, lastError: null },
        });
        await this.automation.enqueue(id, nextAttemptAt);
        return { success: true, id };
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
__decorate([
    (0, common_1.Post)('events/:id/replay'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminAutomationController.prototype, "replaySingle", null);
exports.AdminAutomationController = AdminAutomationController = __decorate([
    (0, swagger_1.ApiTags)('Admin/Automation'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, _admin_guards_1.AdminOnly)(),
    (0, common_1.Controller)({ path: 'admin/automation', version: ['1'] }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        automation_events_service_1.AutomationEventsService])
], AdminAutomationController);
//# sourceMappingURL=automation.controller.js.map