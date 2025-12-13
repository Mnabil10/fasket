import { ConfigService } from '@nestjs/config';
import { AutomationEventsService } from '../automation/automation-events.service';
export declare class OpsAlertService {
    private readonly automation;
    private readonly config;
    private readonly logger;
    private readonly sentryEnabled;
    constructor(automation: AutomationEventsService, config: ConfigService);
    notify(type: string, payload: Record<string, any>, dedupeKey?: string): Promise<void>;
}
