import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { normalizeTtlSeconds } from '../common/utils/ttl.util';

interface AttemptRecord {
  attempts: number;
  lastAttempt: number;
}

@Injectable()
export class AuthRateLimitService {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private readonly ttlSeconds = normalizeTtlSeconds(
    'AUTH_BRUTE_TTL',
    Number(process.env.AUTH_BRUTE_TTL ?? 300),
    60 * 60,
    300,
    this.logger.warn.bind(this.logger),
  ); // 5 minutes
  private readonly maxAttempts = Number(process.env.AUTH_BRUTE_MAX ?? 5);

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private key(identifier: string, ip?: string) {
    const normalized = identifier.toLowerCase();
    return `auth:attempts:${normalized}:${ip ?? 'unknown'}`;
  }

  async trackFailure(identifier: string, ip?: string) {
    if (!identifier) return;
    const key = this.key(identifier, ip);
    const record = ((await this.cache.get<AttemptRecord>(key)) ?? {
      attempts: 0,
      lastAttempt: Date.now(),
    }) as AttemptRecord;
    record.attempts += 1;
    record.lastAttempt = Date.now();
    await this.cache.set(key, record, this.toMs(this.ttlSeconds));
  }

  async reset(identifier: string, ip?: string) {
    if (!identifier) return;
    await this.cache.del(this.key(identifier, ip));
  }

  async ensureCanAttempt(identifier: string, ip?: string) {
    if (!identifier) {
      throw new BadRequestException('Identifier is required');
    }
    const record = await this.cache.get<AttemptRecord>(this.key(identifier, ip));
    if (record && record.attempts >= this.maxAttempts) {
      throw new HttpException(
        `Too many attempts. Try again in ${Math.ceil(this.ttlSeconds / 60)} minutes`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private toMs(seconds: number) {
    if (!Number.isFinite(seconds)) return 0;
    return Math.max(0, Math.floor(seconds * 1000));
  }
}
