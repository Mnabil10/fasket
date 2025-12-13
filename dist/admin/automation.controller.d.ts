import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { AutomationEventStatus } from '@prisma/client';
declare class AutomationEventsQuery {
    status?: AutomationEventStatus;
    type?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
    q?: string;
}
declare class AutomationReplayDto {
    status?: AutomationEventStatus;
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
}
export declare class AdminAutomationController {
    private readonly prisma;
    private readonly automation;
    constructor(prisma: PrismaService, automation: AutomationEventsService);
    list(query: AutomationEventsQuery): Promise<{
        items: {
            status: import(".prisma/client").$Enums.AutomationEventStatus;
            type: string;
            id: string;
            createdAt: Date;
            correlationId: string | null;
            dedupeKey: string | null;
            payload: import("@prisma/client/runtime/library").JsonValue;
            attempts: number;
            nextAttemptAt: Date | null;
            lastHttpStatus: number | null;
            lastError: string | null;
            lastResponseAt: Date | null;
            lastResponseBodySnippet: string | null;
            sentAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
        aggregates: {
            pendingCount: number;
            failedCount: number;
            deadCount: number;
            sentCount: number;
        };
        counts: {
            pendingCount: number;
            failedCount: number;
            deadCount: number;
            sentCount: number;
        };
    }>;
    replay(dto: AutomationReplayDto): Promise<{
        success: boolean;
        replayed: number;
    }>;
    replaySingle(id: string): Promise<{
        success: boolean;
        message: string;
        id?: undefined;
    } | {
        success: boolean;
        id: string;
        message?: undefined;
    }>;
    private aggregateCounts;
}
export {};
