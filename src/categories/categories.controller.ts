import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private service: CategoriesService) {}
  @Get()
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  list(@Query('lang') lang?: 'en'|'ar') {
    return this.service.listActive(lang);
  }
}
