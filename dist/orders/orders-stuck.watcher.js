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
var OrdersStuckWatcher_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersStuckWatcher = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const automation_events_service_1 = require("../automation/automation-events.service");
const ops_alert_service_1 = require("../ops/ops-alert.service");
let OrdersStuckWatcher = OrdersStuckWatcher_1 = class OrdersStuckWatcher {
    constructor(prisma, automation, opsAlerts) {
        this.prisma = prisma;
        this.automation = automation;
        this.opsAlerts = opsAlerts;
        this.logger = new common_1.Logger(OrdersStuckWatcher_1.name);
        this.timer = null;
        this.bucketMinutes = 15;
        this.lastRunAt = null;
        this.enabled = false;
        this.scanIntervalMs = (Number(process.env.ORDER_STUCK_SCAN_MINUTES || 5) || 5) * 60 * 1000;
        this.thresholds = [
            { status: client_1.OrderStatus.PENDING, minutes: Number(process.env.ORDER_STUCK_PENDING_MINUTES || 30) || 30 },
            { status: client_1.OrderStatus.PROCESSING, minutes: Number(process.env.ORDER_STUCK_PROCESSING_MINUTES || 60) || 60 },
            { status: client_1.OrderStatus.OUT_FOR_DELIVERY, minutes: Number(process.env.ORDER_STUCK_OUT_FOR_DELIVERY_MINUTES || 120) || 120 },
        ];
    }
    async onModuleInit() {
        const enabled = (process.env.ORDER_STUCK_WATCHER ?? 'true') !== 'false';
        if (!enabled) {
            this.logger.warn('OrdersStuckWatcher disabled via ORDER_STUCK_WATCHER');
            return;
        }
        this.enabled = true;
        this.logger.log({
            msg: 'OrdersStuckWatcher starting',
            thresholds: this.thresholds,
            intervalMs: this.scanIntervalMs,
        });
        await this.scan();
        this.timer = setInterval(() => {
            this.scan().catch((err) => this.logger.error(err));
        }, this.scanIntervalMs);
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async scan() {
        this.lastRunAt = new Date();
        const now = Date.now();
        for (const threshold of this.thresholds) {
            const cutoff = new Date(now - threshold.minutes * 60 * 1000);
            const orders = await this.prisma.order.findMany({
                where: {
                    status: threshold.status,
                    updatedAt: { lt: cutoff },
                },
                select: {
                    id: true,
                    code: true,
                    status: true,
                    updatedAt: true,
                    createdAt: true,
                    user: { select: { phone: true } },
                    deliveryZoneId: true,
                    deliveryZoneName: true,
                    totalCents: true,
                },
            });
            for (const order of orders) {
                const ageMinutes = Math.floor((now - (order.updatedAt?.getTime?.() ?? order.createdAt.getTime())) / 60000);
                const bucket = Math.floor(ageMinutes / this.bucketMinutes);
                const dedupeKey = `ops:order_stuck:${order.id}:${bucket}`;
                const payload = {
                    order_id: order.id,
                    order_code: order.code ?? order.id,
                    status_internal: order.status,
                    status: this.toPublicStatus(order.status),
                    threshold_minutes: threshold.minutes,
                    age_minutes: ageMinutes,
                    customer_phone: order.user?.phone,
                    total_cents: order.totalCents,
                    delivery_zone: { id: order.deliveryZoneId, name: order.deliveryZoneName },
                    updated_at: order.updatedAt,
                };
                await this.opsAlerts.notify('ops.order_stuck', payload, dedupeKey);
            }
        }
    }
    getStatus() {
        return {
            enabled: this.enabled,
            thresholds: this.thresholds,
            intervalMs: this.scanIntervalMs,
            lastRunAt: this.lastRunAt,
        };
    }
    toPublicStatus(status) {
        switch (status) {
            case client_1.OrderStatus.PROCESSING:
                return 'CONFIRMED';
            case client_1.OrderStatus.OUT_FOR_DELIVERY:
                return 'DELIVERING';
            case client_1.OrderStatus.DELIVERED:
                return 'COMPLETED';
            case client_1.OrderStatus.CANCELED:
                return 'CANCELED';
            default:
                return 'PENDING';
        }
    }
};
exports.OrdersStuckWatcher = OrdersStuckWatcher;
exports.OrdersStuckWatcher = OrdersStuckWatcher = OrdersStuckWatcher_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        automation_events_service_1.AutomationEventsService,
        ops_alert_service_1.OpsAlertService])
], OrdersStuckWatcher);
//# sourceMappingURL=orders-stuck.watcher.js.map