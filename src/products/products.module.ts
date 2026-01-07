import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProviderProductsController } from './provider-products.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [ProductsController, ProviderProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
