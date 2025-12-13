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
const automation_events_service_1 = require("./automation-events.service");
const ops_alert_service_1 = require("../ops/ops-alert.service");
const Sentry = require("@sentry/node");
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000];
const MISCONFIG_DELAY_MS = 15 * 60 * 1000;
let lastMisconfigAlertAt = 0;
let AutomationProcessor = AutomationProcessor_1 = class AutomationProcessor extends bullmq_1.WorkerHost {
    constructor(prisma, config, automation, opsAlerts, queue) {
        super();
        this.prisma = prisma;
        this.config = config;
        this.automation = automation;
        this.opsAlerts = opsAlerts;
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
            const missing = {
                webhook: !this.webhookUrl,
                hmac: !this.hmacSecret,
                nodeEnv: this.config.get('NODE_ENV'),
            };
            this.logger.error({
                msg: 'Automation misconfigured - deferring',
                eventId,
                missingWebhook: missing.webhook,
                missingHmac: missing.hmac,
                env: missing.nodeEnv,
            });
            const nextAttemptAt = new Date(Date.now() + MISCONFIG_DELAY_MS);
            await this.prisma.automationEvent.update({
                where: { id: eventId },
                data: {
                    status: client_1.AutomationEventStatus.FAILED,
                    nextAttemptAt,
                    lastError: 'AUTOMATION_MISCONFIGURED',
                    lastResponseAt: new Date(),
                },
            });
            if (Date.now() - lastMisconfigAlertAt > 60 * 60 * 1000) {
                lastMisconfigAlertAt = Date.now();
                await this.emitOpsMisconfigured(eventId, missing);
            }
            Sentry.captureMessage('Automation misconfigured', {
                level: 'error',
                extra: { eventId, missingWebhook: missing.webhook, missingHmac: missing.hmac, env: missing.nodeEnv },
            });
            if (this.queue) {
                await this.queue.add('deliver', { eventId }, { delay: MISCONFIG_DELAY_MS, removeOnComplete: 50, removeOnFail: 25 });
            }
            else {
                setTimeout(() => this.handleEventById(eventId).catch((err) => this.logger.error(err)), MISCONFIG_DELAY_MS);
            }
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
            if (status === client_1.AutomationEventStatus.DEAD || attemptNumber > BACKOFF_MS.length) {
                await this.emitOpsDeliveryFailed(event, attemptNumber, err?.response?.status);
                Sentry.captureMessage('Automation delivery failed', {
                    level: 'error',
                    extra: { eventId: event.id, type: event.type, attempts: attemptNumber, httpStatus: err?.response?.status },
                });
            }
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
            const base = BACKOFF_MS[attempt - 1];
            const jitter = 0.2 * base;
            const delta = Math.floor(Math.random() * jitter * 2 - jitter);
            return Math.max(1_000, base + delta);
        }
        return null;
    }
    async emitOpsMisconfigured(eventId, missing) {
        await this.opsAlerts.notify('ops.automation_misconfigured', {
            event_id: eventId,
            missing_webhook: missing.webhook,
            missing_hmac: missing.hmac,
            node_env: missing.nodeEnv,
            occurred_at: new Date().toISOString(),
        }, `ops:automation:misconfigured:${Math.floor(Date.now() / (60 * 60 * 1000))}`);
    }
    async emitOpsDeliveryFailed(event, attempt, status) {
        await this.opsAlerts.notify('ops.automation_delivery_failed', {
            event_id: event.id,
            event_type: event.type,
            attempts: attempt,
            last_status: status ?? null,
            correlation_id: event.correlationId,
        }, `ops:automation:delivery_failed:${event.id}:${attempt}`);
    }
};
exports.AutomationProcessor = AutomationProcessor;
exports.AutomationProcessor = AutomationProcessor = AutomationProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('automation-events'),
    (0, common_1.Injectable)(),
    __param(4, (0, bullmq_1.InjectQueue)('automation-events')),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        automation_events_service_1.AutomationEventsService,
        ops_alert_service_1.OpsAlertService,
        bullmq_2.Queue])
], AutomationProcessor);
//# sourceMappingURL=automation.processor.js.map