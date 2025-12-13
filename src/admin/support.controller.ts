import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StaffOrAdmin } from './_admin-guards';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';

class SupportQueriesDto extends PaginationDto {
  phone?: string;
  code?: string;
  intent?: string;
  status?: string;
}

@ApiTags('Admin/Support')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/support', version: ['1'] })
export class AdminSupportController {
  constructor(private readonly svc: AdminService) {}

  @Get('queries')
  @ApiOkResponse({ description: 'Support queries audit log' })
  async list(@Query() query: SupportQueriesDto) {
    const where: any = {};
    if (query.intent) where.endpoint = query.intent;
    if (query.status) where.success = query.status.toUpperCase() === 'SUCCESS';

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.supportQueryAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.svc.prisma.supportQueryAudit.count({ where }),
    ]);

    const mapped = items.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      phone: null, // phone is hashed in DB; not returned
      orderCode: null,
      intent: row.endpoint,
      status: row.success ? 'SUCCESS' : 'FAILED',
      responseSnippet: null,
      correlationId: row.correlationId,
    }));

    return {
      items: mapped,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? query.limit ?? 20,
    };
  }
}
