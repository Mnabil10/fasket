import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContextState {
  correlationId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  role?: string;
  phone?: string;
  email?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run(callback: () => void, seed?: Partial<RequestContextState>) {
    const store: RequestContextState = {
      correlationId: seed?.correlationId || randomUUID(),
      ip: seed?.ip,
      userAgent: seed?.userAgent,
      userId: seed?.userId,
      role: seed?.role,
      phone: seed?.phone,
      email: seed?.email,
    };
    this.storage.run(store, callback);
  }

  get<T extends keyof RequestContextState>(key: T): RequestContextState[T] | undefined {
    const store = this.storage.getStore();
    return store ? store[key] : undefined;
  }

  set<T extends keyof RequestContextState>(key: T, value: RequestContextState[T]) {
    const store = this.storage.getStore();
    if (store) {
      store[key] = value;
    }
  }

  getStore() {
    return this.storage.getStore();
  }
}
