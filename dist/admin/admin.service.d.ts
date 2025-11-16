import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { SlugService } from '../common/slug/slug.service';
export declare class AdminService {
    prisma: PrismaService;
    audit: AuditLogService;
    cache: CacheInvalidationService;
    slugs: SlugService;
    constructor(prisma: PrismaService, audit: AuditLogService, cache: CacheInvalidationService, slugs: SlugService);
}
