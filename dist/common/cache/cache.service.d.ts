import type { Cache } from 'cache-manager';
type CacheKeyPart = string | number | boolean | null | undefined | Record<string, any>;
export declare class CacheService {
    private readonly cache;
    private readonly defaultTtl;
    constructor(cache: Cache);
    buildKey(namespace: string, ...parts: CacheKeyPart[]): string;
    wrap<T>(key: string, handler: () => Promise<T>, ttl?: number): Promise<T>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
    deleteMatching(pattern: string): Promise<void>;
    private normalizePart;
}
export {};
