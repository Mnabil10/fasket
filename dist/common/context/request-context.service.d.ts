export interface RequestContextState {
    correlationId: string;
    ip?: string;
    userAgent?: string;
    userId?: string;
    role?: string;
    phone?: string;
    email?: string;
}
export declare class RequestContextService {
    private readonly storage;
    run(callback: () => void, seed?: Partial<RequestContextState>): void;
    get<T extends keyof RequestContextState>(key: T): RequestContextState[T] | undefined;
    set<T extends keyof RequestContextState>(key: T, value: RequestContextState[T]): void;
    getStore(): RequestContextState | undefined;
}
