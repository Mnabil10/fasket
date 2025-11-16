import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { PublicCategoryListDto } from './dto/public-category-query.dto';

@ApiTags('Categories')
@Controller({ path: 'categories', version: ['1', '2'] })
export class CategoriesController {
  constructor(private service: CategoriesService) {}
  @Get()
  @ApiQuery({ name: 'lang', required: false, enum: ['en','ar'] })
  @ApiQuery({ name: 'q', required: false })
  list(@Query() query: PublicCategoryListDto) {
    return this.service.listActive(query);
  }
}
