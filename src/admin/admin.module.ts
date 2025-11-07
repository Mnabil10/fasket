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
    // ✅ Modules go here
    UploadsModule,
    // ...other modules
  ],
  providers: [AdminService],
})
export class AdminModule {}
