import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { CacheInvalidationService } from '../common/cache/cache-invalidation.service';
import { SlugService } from '../common/slug/slug.service';

@Injectable()
export class AdminService {
  constructor(
    public prisma: PrismaService,
    public audit: AuditLogService,
    public cache: CacheInvalidationService,
    public slugs: SlugService,
  ) {}
}
