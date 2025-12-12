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
var AutomationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const axios_1 = require("axios");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000];
let AutomationProcessor = AutomationProcessor_1 = class AutomationProcessor extends bullmq_1.WorkerHost {
    constructor(prisma, config, queue) {
        super();
        this.prisma = prisma;
        this.config = config;
        this.queue = queue;
        this.logger = new common_1.Logger(AutomationProcessor_1.name);
        this.webhookUrl = this.config.get('AUTOMATION_WEBHOOK_URL') ?? '';
        this.hmacSecret = this.config.get('AUTOMATION_HMAC_SECRET') ?? '';
    }
    async process(job) {
        await this.handleEventById(job.data.eventId);
    }
    async handleEventById(eventId) {
        const event = await this.prisma.automationEvent.findUnique({ where: { id: eventId } });
        if (!event) {
            this.logger.warn({ msg: 'Automation event missing', eventId });
            return;
        }
        if (!this.webhookUrl || !this.hmacSecret) {
            this.logger.error({ msg: 'Automation webhook/HMAC not configured; marking event dead', eventId });
            await this.prisma.automationEvent.update({
                where: { id: eventId },
                data: { status: client_1.AutomationEventStatus.DEAD },
            });
            return;
        }
        if (event.status === client_1.AutomationEventStatus.SENT || event.status === client_1.AutomationEventStatus.DEAD) {
            return;
        }
        if (event.nextAttemptAt && event.nextAttemptAt.getTime() > Date.now()) {
            const delay = event.nextAttemptAt.getTime() - Date.now();
            if (this.queue) {
                await this.queue.add('deliver', { eventId }, { delay, removeOnComplete: 50, removeOnFail: 25 });
            }
            else {
                setTimeout(() => this.handleEventById(eventId).catch((err) => this.logger.error(err)), delay);
            }
            return;
        }
        const attemptNumber = (event.attempts ?? 0) + 1;
        const timestamp = Math.floor(Date.now() / 1000);
        const payload = {
            event_id: event.id,
            event_type: event.type,
            occurred_at: event.createdAt.toISOString(),
            correlation_id: event.correlationId,
            version: '1.0',
            dedupe_key: event.dedupeKey,
            attempt: attemptNumber,
            data: event.payload,
        };
        const body = JSON.stringify(payload);
        const signature = this.sign(`${timestamp}.${body}`);
        try {
            const response = await axios_1.default.post(this.webhookUrl, body, {
                headers: {
                    'content-type': 'application/json',
                    'x-fasket-event': event.type,
                    'x-fasket-id': event.id,
                    'x-fasket-timestamp': String(timestamp),
                    'x-fasket-signature': signature,
                    'x-fasket-attempt': String(attemptNumber),
                    'x-fasket-spec-version': '1.0',
                },
                timeout: 5000,
                validateStatus: () => true,
            });
            const retryAfter = Number(response.headers?.['retry-after']);
            if (response.status === 409) {
                this.logger.warn({ msg: 'Received 409, treating as delivered (idempotent)', eventId: event.id });
            }
            if (response.status >= 200 && response.status < 300 || response.status === 409) {
                await this.prisma.automationEvent.update({
                    where: { id: event.id },
                    data: {
                        status: client_1.AutomationEventStatus.SENT,
                        attempts: attemptNumber,
                        nextAttemptAt: null,
                        lastHttpStatus: response.status,
                        lastError: null,
                        lastResponseAt: new Date(),
                        lastResponseBodySnippet: this.snippet(response.data),
                        sentAt: new Date(),
                    },
                });
                this.logger.log({ msg: 'Automation event delivered', eventId: event.id, status: response.status });
                return;
            }
            throw new Error(`Webhook responded with status ${response.status}`);
        }
        catch (err) {
            const delay = this.nextDelayMs(attemptNumber);
            const status = delay === null ? client_1.AutomationEventStatus.DEAD : client_1.AutomationEventStatus.FAILED;
            await this.prisma.automationEvent.update({
                where: { id: event.id },
                data: {
                    status,
                    attempts: attemptNumber,
                    nextAttemptAt: delay === null ? null : new Date(Date.now() + delay),
                    lastError: err.message,
                    lastResponseAt: new Date(),
                    lastResponseBodySnippet: this.snippet(err?.response?.data),
                    lastHttpStatus: err?.response?.status ?? null,
                },
            });
            this.logger.warn({
                msg: 'Automation delivery failed',
                eventId: event.id,
                attempt: attemptNumber,
                status,
                delayMs: delay ?? undefined,
                error: err.message,
            });
            if (status === client_1.AutomationEventStatus.FAILED) {
                const effectiveDelay = this.applyRetryAfter(delay, err);
                if (this.queue) {
                    await this.queue.add('deliver', { eventId }, { delay: effectiveDelay, removeOnComplete: 50, removeOnFail: 25 });
                }
                else {
                    setTimeout(() => this.handleEventById(eventId).catch((error) => this.logger.error(error)), effectiveDelay);
                }
            }
        }
    }
    snippet(body) {
        try {
            const str = typeof body === 'string' ? body : JSON.stringify(body);
            return str.slice(0, 1024);
        }
        catch {
            return undefined;
        }
    }
    applyRetryAfter(delay, err) {
        const retryAfterHeader = err?.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
        if (retryAfterMs && Number.isFinite(retryAfterMs)) {
            return Math.max(delay, retryAfterMs);
        }
        return delay;
    }
    sign(payload) {
        return (0, crypto_1.createHmac)('sha256', this.hmacSecret).update(payload).digest('hex');
    }
    nextDelayMs(attempt) {
        if (attempt <= BACKOFF_MS.length) {
            return BACKOFF_MS[attempt - 1];
        }
        return null;
    }
};
exports.AutomationProcessor = AutomationProcessor;
exports.AutomationProcessor = AutomationProcessor = AutomationProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('automation-events'),
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)('automation-events')),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        bullmq_2.Queue])
], AutomationProcessor);
//# sourceMappingURL=automation.processor.js.map