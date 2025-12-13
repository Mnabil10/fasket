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
var OpsAlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpsAlertService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const Sentry = require("@sentry/node");
const automation_events_service_1 = require("../automation/automation-events.service");
let OpsAlertService = OpsAlertService_1 = class OpsAlertService {
    constructor(automation, config) {
        this.automation = automation;
        this.config = config;
        this.logger = new common_1.Logger(OpsAlertService_1.name);
        this.sentryEnabled = Boolean(this.config.get('SENTRY_DSN'));
        this.logger.log({
            msg: 'OpsAlert sinks enabled',
            sinks: {
                outbox: true,
                log: true,
                sentry: this.sentryEnabled,
            },
        });
        if (!this.sentryEnabled && ['production', 'staging'].includes((process.env.NODE_ENV || '').toLowerCase())) {
            this.logger.warn('Sentry DSN missing in production/staging; ops alerts will log only.');
        }
    }
    async notify(type, payload, dedupeKey) {
        this.logger.error({ msg: 'Ops alert', type, payload });
        if (this.sentryEnabled) {
            Sentry.captureMessage(`Ops alert: ${type}`, { level: 'error', extra: payload });
        }
        try {
            await this.automation.emit(type, payload, { dedupeKey });
        }
        catch (err) {
            this.logger.error({ msg: 'Failed to emit ops alert to outbox', type, error: err?.message });
        }
    }
};
exports.OpsAlertService = OpsAlertService;
exports.OpsAlertService = OpsAlertService = OpsAlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [automation_events_service_1.AutomationEventsService, config_1.ConfigService])
], OpsAlertService);
//# sourceMappingURL=ops-alert.service.js.map