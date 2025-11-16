import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
export declare class AuditLogService {
    private readonly prisma;
    private readonly context;
    constructor(prisma: PrismaService, context: RequestContextService);
    log(params: {
        action: string;
        entity: string;
        entityId?: string;
        before?: Record<string, any> | null;
        after?: Record<string, any> | null;
    }): Promise<void>;
}
