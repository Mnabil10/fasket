import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProviderProductsController } from './provider-products.controller';
import { ProviderProductOptionsController } from './provider-product-options.controller';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductOptionsBulkService } from '../admin/product-options-bulk.service';

@Module({
  imports: [UploadsModule],
  controllers: [ProductsController, ProviderProductsController, ProviderProductOptionsController],
  providers: [ProductsService, ProductOptionsBulkService],
})
export class ProductsModule {}
