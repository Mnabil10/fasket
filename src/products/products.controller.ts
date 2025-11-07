import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'min', required: false })
  @ApiQuery({ name: 'max', required: false })
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  list(
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('min') min?: number,
    @Query('max') max?: number,
    @Query('lang') lang?: 'en'|'ar',
  ) {
    return this.service.list({ q, categoryId, min: min ? Number(min) : undefined, max: max ? Number(max) : undefined, lang });
  }

  @Get('public/best-selling')
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 10 } })
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  bestSelling(@Query('limit') limit?: string, @Query('lang') lang?: 'en'|'ar') {
    return this.service.bestSelling(limit ? Number(limit) : 10, lang);
  }

  @Get('public/hot-offers')
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 10 } })
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  hotOffers(@Query('limit') limit?: string, @Query('lang') lang?: 'en'|'ar') {
    return this.service.hotOffers(limit ? Number(limit) : 10, lang);
  }

  @Get(':idOrSlug')
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  one(@Param('idOrSlug') idOrSlug: string, @Query('lang') lang?: 'en'|'ar') {
    return this.service.one(idOrSlug, lang);
  }
}
