import { Controller, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Admin/Support')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/support/backfill', version: ['1'] })
export class SupportBackfillController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async backfill(@Query('batch') batch = '500') {
    const take = Math.min(Math.max(Number(batch) || 500, 1), 2000);
    const rows = await this.prisma.supportQueryAudit.findMany({
      where: {
        OR: [{ phoneMasked: null }, { orderCode: null }],
      },
      select: { id: true, phoneHash: true, phoneMasked: true, orderCode: true },
      take,
    });
    for (const row of rows) {
      await this.prisma.supportQueryAudit.update({
        where: { id: row.id },
        data: {
          phoneMasked: row.phoneMasked ?? (row.phoneHash ? 'masked' : 'unknown'),
          orderCode: row.orderCode ?? null,
        },
      });
    }
    return { success: true, processed: rows.length, remaining: rows.length < take ? 0 : 'more' };
  }
}
