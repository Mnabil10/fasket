import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit/audit-log.service';
import { RequestContextService } from './context/request-context.service';
import { CacheInvalidationService } from './cache/cache-invalidation.service';
import { CacheService } from './cache/cache.service';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { SlugService } from './slug/slug.service';
import { InternalSecretGuard } from './guards/internal-secret.guard';

@Global()
@Module({
  providers: [
    AuditLogService,
    RequestContextService,
    CacheInvalidationService,
    CacheService,
    ResponseInterceptor,
    AllExceptionsFilter,
    SlugService,
    InternalSecretGuard,
  ],
  exports: [
    AuditLogService,
    RequestContextService,
    CacheInvalidationService,
    CacheService,
    ResponseInterceptor,
    AllExceptionsFilter,
    SlugService,
    InternalSecretGuard,
  ],
})
export class CommonModule {}
