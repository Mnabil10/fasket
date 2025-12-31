import { Module } from '@nestjs/common';
import { AdminProductsController } from './products.controller';
import { AdminCategoriesController } from './categories.controller';
import { AdminOrdersController } from './orders.controller';
import { AdminCustomersController } from './customers.controller';
import { AdminSettingsController } from './settings.controller';
import { AdminDashboardController } from './dashboard.controller';
import { AdminService } from './admin.service';
import { AdminCouponsController } from './coupons.controller';
import { AdminLoyaltyController } from './loyalty.controller';
import { UploadsModule } from 'src/uploads/uploads.module';
import { ProductsBulkService } from './products-bulk.service';
import { AdminDeliveryDriversController } from './delivery-drivers.controller';
import { DeliveryDriversModule } from '../delivery-drivers/delivery-drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminDeliveryZonesController } from './delivery-zones.controller';
import { AutomationModule } from '../automation/automation.module';
import { AdminReportsController } from './reports.controller';
import { AdminAutomationController } from './automation.controller';
import { AdminSupportController } from './support.controller';
import { SupportBackfillController } from './support-backfill.controller';
import { AdminOpsController } from './ops.controller';
import { AdminProvidersController } from './providers.controller';
import { AdminBranchesController } from './branches.controller';
import { AdminPlansController } from './plans.controller';
import { AdminSubscriptionsController } from './subscriptions.controller';
import { AdminInvoicesController } from './invoices.controller';

@Module({
  controllers: [
    AdminProductsController,
    AdminCategoriesController,
    AdminOrdersController,
    AdminCustomersController,
    AdminSettingsController,
    AdminDashboardController,
    AdminCouponsController,
    AdminDeliveryDriversController,
    AdminDeliveryZonesController,
    AdminLoyaltyController,
    AdminReportsController,
    AdminAutomationController,
    AdminSupportController,
    SupportBackfillController,
    AdminOpsController,
    AdminProvidersController,
    AdminBranchesController,
    AdminPlansController,
    AdminSubscriptionsController,
    AdminInvoicesController,
  ],
  imports: [
    // Additional modules can be wired here when needed
    UploadsModule,
    NotificationsModule,
    OrdersModule,
    DeliveryDriversModule,
    AutomationModule,
    // ...other modules
  ],
  providers: [AdminService, ProductsBulkService],
})
export class AdminModule {}
