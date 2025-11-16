import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheInvalidationService {
  constructor(private readonly cache: CacheService) {}

  async categoriesChanged() {
    await this.invalidateByPattern('categories:*');
    await this.invalidateByPattern('home:*');
  }

  async productsChanged() {
    await this.invalidateByPattern('products:*');
    await this.invalidateByPattern('home:*');
  }

  async homeSectionsChanged() {
    await this.invalidateByPattern('home:*');
  }

  private async invalidateByPattern(pattern: string) {
    await this.cache.deleteMatching(pattern);
  }
}
