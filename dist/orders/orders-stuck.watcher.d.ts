import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEventsService } from '../automation/automation-events.service';
import { OpsAlertService } from '../ops/ops-alert.service';
export interface Threshold {
    status: OrderStatus;
    minutes: number;
}
export declare class OrdersStuckWatcher implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly automation;
    private readonly opsAlerts;
    private readonly logger;
    private timer;
    private readonly scanIntervalMs;
    private readonly bucketMinutes;
    private readonly thresholds;
    private lastRunAt;
    private enabled;
    constructor(prisma: PrismaService, automation: AutomationEventsService, opsAlerts: OpsAlertService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    private scan;
    getStatus(): {
        enabled: boolean;
        thresholds: Threshold[];
        intervalMs: number;
        lastRunAt: Date | null;
    };
    private toPublicStatus;
}
