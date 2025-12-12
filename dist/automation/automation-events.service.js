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
var AutomationEventsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationEventsService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const bullmq_2 = require("@nestjs/bullmq");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const request_context_service_1 = require("../common/context/request-context.service");
const automation_processor_1 = require("./automation.processor");
let AutomationEventsService = AutomationEventsService_1 = class AutomationEventsService {
    constructor(prisma, context, queue, processor) {
        this.prisma = prisma;
        this.context = context;
        this.queue = queue;
        this.processor = processor;
        this.logger = new common_1.Logger(AutomationEventsService_1.name);
    }
    async emit(type, payload, options = {}) {
        const correlationId = options.correlationId ?? this.context.get('correlationId');
        const nextAttemptAt = options.nextAttemptAt ?? new Date();
        const client = options.tx ?? this.prisma;
        const dedupeKey = options.dedupeKey ?? this.defaultDedupeKey(type, payload);
        if (options.dedupeKey) {
            const existing = await client.automationEvent.findFirst({
                where: { dedupeKey: options.dedupeKey, type },
                select: { id: true, nextAttemptAt: true, status: true },
            });
            if (existing) {
                if (!options.tx) {
                    await this.enqueue(existing.id, existing.nextAttemptAt ?? undefined);
                }
                if (existing.status === client_1.AutomationEventStatus.SENT || existing.status === client_1.AutomationEventStatus.DEAD) {
                    return { id: existing.id, nextAttemptAt: existing.nextAttemptAt };
                }
                return { id: existing.id, nextAttemptAt: existing.nextAttemptAt };
            }
        }
        const event = await client.automationEvent.create({
            data: {
                type,
                payload: payload,
                status: client_1.AutomationEventStatus.PENDING,
                attempts: 0,
                nextAttemptAt,
                dedupeKey,
                correlationId,
            },
            select: { id: true, nextAttemptAt: true },
        });
        if (!options.tx) {
            await this.enqueue(event.id, event.nextAttemptAt ?? undefined);
        }
        return { id: event.id, nextAttemptAt: event.nextAttemptAt };
    }
    async enqueue(eventId, nextAttemptAt) {
        const event = await this.prisma.automationEvent.findUnique({
            where: { id: eventId },
            select: { status: true, nextAttemptAt: true },
        });
        if (!event) {
            this.logger.warn({ msg: 'Cannot enqueue missing automation event', eventId });
            return;
        }
        if (event.status === client_1.AutomationEventStatus.SENT || event.status === client_1.AutomationEventStatus.DEAD) {
            this.logger.debug({ msg: 'Skipping enqueue for finalized automation event', eventId, status: event.status });
            return;
        }
        const targetNext = nextAttemptAt ?? event.nextAttemptAt ?? new Date();
        const delay = targetNext ? Math.max(0, targetNext.getTime() - Date.now()) : 0;
        const queueDisabled = this.queue?.__automationDisabled === true;
        if (this.queue && !queueDisabled) {
            await this.queue.add('deliver', { eventId }, {
                delay,
                removeOnComplete: 50,
                removeOnFail: 25,
            });
            return;
        }
        if (queueDisabled) {
            this.logger.warn({ msg: 'Automation queue disabled; event left pending', eventId, status: event.status });
            return;
        }
        if (this.processor) {
            setImmediate(async () => {
                try {
                    await this.processor?.handleEventById(eventId);
                }
                catch (err) {
                    const msg = err?.message;
                    this.logger.warn({ msg: 'Inline automation processing failed', eventId, error: msg });
                }
            });
            return;
        }
        this.logger.warn({ msg: 'No automation queue or processor available; event not dispatched', eventId });
    }
    async enqueueMany(events) {
        await Promise.all(events.map((event) => this.enqueue(event.id, event.nextAttemptAt ?? undefined)));
    }
    defaultDedupeKey(type, payload) {
        const hint = payload?.order_id || payload?.orderId || payload?.otpId || payload?.event_id;
        return hint ? `${type}:${hint}` : `${type}:${Date.now()}`;
    }
};
exports.AutomationEventsService = AutomationEventsService;
exports.AutomationEventsService = AutomationEventsService = AutomationEventsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_2.InjectQueue)('automation-events')),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        request_context_service_1.RequestContextService,
        bullmq_1.Queue,
        automation_processor_1.AutomationProcessor])
], AutomationEventsService);
//# sourceMappingURL=automation-events.service.js.map