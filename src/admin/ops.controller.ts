import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { OrdersStuckWatcher } from '../orders/orders-stuck.watcher';

type OrdersStuckStatus = ReturnType<OrdersStuckWatcher['getStatus']>;

@ApiTags('Admin/Ops')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/ops', version: ['1'] })
export class AdminOpsController {
  constructor(private readonly stuckWatcher: OrdersStuckWatcher) {}

  @Get('watchers')
  status(): { watchers: { ordersStuck: OrdersStuckStatus } } {
    return {
      watchers: {
        ordersStuck: this.stuckWatcher.getStatus?.() ?? { enabled: false },
      },
    };
  }
}
