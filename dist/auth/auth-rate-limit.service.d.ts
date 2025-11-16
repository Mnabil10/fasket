import type { Cache } from 'cache-manager';
export declare class AuthRateLimitService {
    private cache;
    private readonly ttl;
    private readonly maxAttempts;
    constructor(cache: Cache);
    private key;
    trackFailure(identifier: string, ip?: string): Promise<void>;
    reset(identifier: string, ip?: string): Promise<void>;
    ensureCanAttempt(identifier: string, ip?: string): Promise<void>;
}
