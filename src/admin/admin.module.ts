import { Module } from '@nestjs/common';
import { AdminProductsController } from './products.controller';
import { AdminCategoriesController } from './categories.controller';
import { AdminOrdersController } from './orders.controller';
import { AdminCustomersController } from './customers.controller';
import { AdminSettingsController } from './settings.controller';
import { AdminDashboardController } from './dashboard.controller';
import { AdminService } from './admin.service';
import { AdminCouponsController } from './coupons.controller';
import { UploadsModule } from 'src/uploads/uploads.module';
import { ProductsBulkService } from './products-bulk.service';
import { AdminDeliveryDriversController } from './delivery-drivers.controller';
import { DeliveryDriversModule } from '../delivery-drivers/delivery-drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';

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
  ],
  imports: [
    // Additional modules can be wired here when needed
    UploadsModule,
    NotificationsModule,
    OrdersModule,
    DeliveryDriversModule,
    // ...other modules
  ],
  providers: [AdminService, ProductsBulkService],
})
export class AdminModule {}
