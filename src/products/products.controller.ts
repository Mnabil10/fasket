import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { LangNormalizePipe } from '../common/pipes/lang-normalize.pipe';
import { PublicProductFeedDto, PublicProductListDto } from './dto/public-product-query.dto';

@ApiTags('Products')
@Controller({ path: 'products', version: ['1', '2'] })
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Get()
  list(@Query() query: PublicProductListDto) {
    return this.service.list(query);
  }

  @Get('public/best-selling')
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  bestSelling(@Query() query: PublicProductFeedDto) {
    return this.service.bestSelling(query);
  }

  @Get('public/hot-offers')
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  hotOffers(@Query() query: PublicProductFeedDto) {
    return this.service.hotOffers(query);
  }

  @Get(':idOrSlug')
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  one(@Param('idOrSlug') idOrSlug: string, @Query('lang', LangNormalizePipe) lang?: 'en'|'ar') {
    return this.service.one(idOrSlug, lang);
  }
}
