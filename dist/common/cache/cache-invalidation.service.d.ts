import { CacheService } from './cache.service';
export declare class CacheInvalidationService {
    private readonly cache;
    constructor(cache: CacheService);
    categoriesChanged(): Promise<void>;
    productsChanged(): Promise<void>;
    homeSectionsChanged(): Promise<void>;
    private invalidateByPattern;
}
