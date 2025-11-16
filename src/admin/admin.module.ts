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

@Module({
  controllers: [
    AdminProductsController,
    AdminCategoriesController,
    AdminOrdersController,
    AdminCustomersController,
    AdminSettingsController,
    AdminDashboardController,
    AdminCouponsController,
  ],
  imports: [
    // Additional modules can be wired here when needed
    UploadsModule,
    // ...other modules
  ],
  providers: [AdminService, ProductsBulkService],
})
export class AdminModule {}
