import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { InvoiceListRequestDto } from './dto/invoice.dto';

@ApiTags('Admin/Invoices')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/invoices', version: ['1'] })
export class AdminInvoicesController {
  constructor(private svc: AdminService) {}

  @Get()
  @ApiQuery({ name: 'providerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOkResponse({ description: 'Paginated invoices' })
  async list(@Query() query: InvoiceListRequestDto) {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status as any;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [items, total] = await this.svc.prisma.$transaction([
      this.svc.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          provider: { select: { id: true, name: true, slug: true } },
          subscription: {
            select: {
              id: true,
              status: true,
              plan: { select: { id: true, name: true, code: true, billingInterval: true } },
            },
          },
          _count: { select: { items: true } },
        },
      }),
      this.svc.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const invoice = await this.svc.prisma.invoice.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, slug: true } },
        subscription: {
          select: {
            id: true,
            status: true,
            plan: { select: { id: true, name: true, code: true, billingInterval: true } },
          },
        },
        items: { orderBy: { createdAt: 'asc' } },
        ledgerEntries: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
