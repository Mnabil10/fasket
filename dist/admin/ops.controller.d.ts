import { OrdersStuckWatcher } from '../orders/orders-stuck.watcher';
type OrdersStuckStatus = ReturnType<OrdersStuckWatcher['getStatus']>;
export declare class AdminOpsController {
    private readonly stuckWatcher;
    constructor(stuckWatcher: OrdersStuckWatcher);
    status(): {
        watchers: {
            ordersStuck: OrdersStuckStatus;
        };
    };
}
export {};
