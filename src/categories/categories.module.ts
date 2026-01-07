import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProviderCategoriesController } from './provider-categories.controller';

@Module({
  controllers: [CategoriesController, ProviderCategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
