import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { createHash } from 'crypto';

type CacheKeyPart = string | number | boolean | null | undefined | Record<string, any>;

@Injectable()
export class CacheService {
  private readonly defaultTtl = Number(process.env.CACHE_DEFAULT_TTL ?? 60);
  private hits = 0;
  private misses = 0;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  buildKey(namespace: string, ...parts: CacheKeyPart[]): string {
    const normalized = parts
      .map((part) => this.normalizePart(part))
      .filter((part) => part.length > 0);
    return [namespace, ...normalized].join(':');
  }

  async wrap<T>(key: string, handler: () => Promise<T>, ttl?: number) {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = await handler();
    await this.set(key, value, ttl);
    return value;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.cache.get<T>(key);
    if (value === undefined) {
      this.misses += 1;
    } else {
      this.hits += 1;
    }
    return value === undefined ? undefined : value;
  }

  async set<T>(key: string, value: T, ttl?: number) {
    const effectiveTtl = ttl ?? this.defaultTtl;
    if (effectiveTtl <= 0) return;
    await this.cache.set(key, value, effectiveTtl);
  }

  async del(key: string) {
    await this.cache.del(key);
  }

  async deleteMatching(pattern: string) {
    const store: any = (this.cache as any).store;
    if (typeof store?.keys === 'function') {
      const keys: string[] = await store.keys(pattern);
      if (keys?.length) {
        await Promise.all(keys.map((key) => this.cache.del(key)));
      }
      return;
    }
    const reset = (this.cache as any).reset;
    if (typeof reset === 'function') {
      await reset.call(this.cache);
    }
  }

  private normalizePart(part: CacheKeyPart): string {
    if (part === null || part === undefined) return '';
    if (typeof part === 'object') {
      const ordered: Record<string, any> = {};
      Object.keys(part)
        .sort()
        .forEach((key) => {
          ordered[key] = (part as any)[key];
        });
      return this.hash(JSON.stringify(ordered));
    }
    return String(part);
  }

  private hash(input: string) {
    return createHash('sha1').update(input).digest('hex');
  }

  stats() {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      total,
    };
  }
}
