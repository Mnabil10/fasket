import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { AutomationEventsService } from '../automation/automation-events.service';

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private readonly sentryEnabled: boolean;

  constructor(
    @Inject(forwardRef(() => AutomationEventsService)) private readonly automation: AutomationEventsService,
    private readonly config: ConfigService,
  ) {
    this.sentryEnabled = Boolean(this.config.get<string>('SENTRY_DSN'));
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

  async notify(type: string, payload: Record<string, any>, dedupeKey?: string) {
    this.logger.error({ msg: 'Ops alert', type, payload });
    if (this.sentryEnabled) {
      Sentry.captureMessage(`Ops alert: ${type}`, { level: 'error', extra: payload });
    }
    try {
      await this.automation.emit(type, payload, { dedupeKey });
    } catch (err) {
      this.logger.error({ msg: 'Failed to emit ops alert to outbox', type, error: (err as Error)?.message });
    }
  }
}
