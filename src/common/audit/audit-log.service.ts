import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async log(params: {
    action: string;
    entity: string;
    entityId?: string;
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    actorId?: string;
  }) {
    const actorId = params.actorId ?? this.context.get('userId');
    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before as any,
        after: params.after as any,
        actorId,
        ip: this.context.get('ip'),
        userAgent: this.context.get('userAgent'),
        correlationId: this.context.get('correlationId'),
      },
    });
  }
}
