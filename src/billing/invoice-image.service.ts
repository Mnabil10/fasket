import { Injectable } from '@nestjs/common';
import { InvoiceItemType } from '@prisma/client';
import * as sharpModule from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

const sharp: typeof sharpModule = (() => {
  const candidate = (sharpModule as unknown as { default?: typeof sharpModule })?.default ?? (sharpModule as any);
  if (typeof candidate !== 'function') {
    throw new Error('Sharp module did not export a callable factory');
  }
  return candidate;
})();

@Injectable()
export class InvoiceImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async createInvoiceImage(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        provider: { select: { id: true, name: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const svg = this.buildInvoiceSvg(invoice);
    const buffer = await sharp(Buffer.from(svg))
      .png({ quality: 92 })
      .toBuffer();
    const filename = `invoice-${invoice.number || invoice.id}.png`;
    const stored = await this.uploads.uploadGeneratedImage({
      buffer,
      filename,
      contentType: 'image/png',
      folder: 'invoices',
    });
    return { url: stored.url, filename };
  }

  private buildInvoiceSvg(invoice: {
    id: string;
    number: string;
    status: string;
    currency: string;
    amountDueCents: number;
    amountPaidCents: number;
    dueAt: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    provider?: { name: string } | null;
    items: Array<{ description: string | null; amountCents: number; type: InvoiceItemType }>;
  }) {
    const width = 900;
    const padding = 40;
    const rowHeight = 34;
    const headerHeight = 150;
    const footerHeight = 120;
    const items = invoice.items ?? [];
    const itemsHeight = Math.max(1, items.length) * rowHeight + 20;
    const height = headerHeight + itemsHeight + footerHeight;
    const contentStartY = 120;
    const itemsStartY = headerHeight + 10;
    const labels = this.arabicLabels();
    const providerName = this.escapeXml(invoice.provider?.name || '-');
    const period = this.formatPeriod(invoice.periodStart, invoice.periodEnd);
    const dueDate = this.formatDate(invoice.dueAt);
    const status = this.escapeXml(this.localizeStatus(invoice.status));
    const amountDue = this.formatCurrency(invoice.amountDueCents, invoice.currency);
    const amountPaid = this.formatCurrency(invoice.amountPaidCents, invoice.currency);

    let rows = '';
    let y = itemsStartY + rowHeight;
    const safeItems = items.length ? items : [{ description: labels.noItems, amountCents: 0, type: 'SUBSCRIPTION' as InvoiceItemType }];
    for (const item of safeItems) {
      const label = this.escapeXml(item.description || this.localizeItemType(item.type));
      const amount = this.formatCurrency(item.amountCents, invoice.currency);
      rows += `
      <text x="${padding}" y="${y}" font-size="16" fill="#111">${label}</text>
      <text x="${width - padding}" y="${y}" font-size="16" fill="#111" text-anchor="end">${amount}</text>`;
      y += rowHeight;
    }

    const totalY = height - footerHeight + 40;
    const paidY = totalY + 28;
    const dueY = paidY + 28;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="${padding / 2}" y="${padding / 2}" width="${width - padding}" height="${height - padding}" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${padding}" y="64" font-size="28" font-weight="700" fill="#111">${labels.title}</text>
  <text x="${width - padding}" y="64" font-size="18" fill="#475569" text-anchor="end">${labels.number}: ${this.escapeXml(invoice.number)}</text>

  <text x="${padding}" y="${contentStartY}" font-size="16" fill="#111">${labels.provider}: ${providerName}</text>
  <text x="${padding}" y="${contentStartY + 26}" font-size="16" fill="#111">${labels.period}: ${period}</text>
  <text x="${padding}" y="${contentStartY + 52}" font-size="16" fill="#111">${labels.dueDate}: ${dueDate}</text>
  <text x="${padding}" y="${contentStartY + 78}" font-size="16" fill="#111">${labels.status}: ${status}</text>

  <line x1="${padding}" y1="${itemsStartY - 10}" x2="${width - padding}" y2="${itemsStartY - 10}" stroke="#e2e8f0"/>
  <text x="${padding}" y="${itemsStartY + 2}" font-size="16" fill="#475569">${labels.items}</text>
  <text x="${width - padding}" y="${itemsStartY + 2}" font-size="16" fill="#475569" text-anchor="end">${labels.amount}</text>
  ${rows}
  <line x1="${padding}" y1="${y - 10}" x2="${width - padding}" y2="${y - 10}" stroke="#e2e8f0"/>

  <text x="${padding}" y="${totalY}" font-size="16" fill="#111">${labels.amountDue}</text>
  <text x="${width - padding}" y="${totalY}" font-size="16" fill="#111" text-anchor="end">${amountDue}</text>
  <text x="${padding}" y="${paidY}" font-size="16" fill="#111">${labels.amountPaid}</text>
  <text x="${width - padding}" y="${paidY}" font-size="16" fill="#111" text-anchor="end">${amountPaid}</text>
  <text x="${padding}" y="${dueY}" font-size="16" fill="#111">${labels.amountRemaining}</text>
  <text x="${width - padding}" y="${dueY}" font-size="16" fill="#111" text-anchor="end">${amountDue}</text>
</svg>`;
  }

  private arabicLabels() {
    return {
      title: '\u0641\u0627\u062A\u0648\u0631\u0629',
      number: '\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629',
      provider: '\u0627\u0644\u0645\u0632\u0648\u0651\u062F',
      period: '\u0627\u0644\u0641\u062A\u0631\u0629',
      dueDate: '\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642',
      status: '\u0627\u0644\u062D\u0627\u0644\u0629',
      items: '\u0628\u0646\u0648\u062F \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629',
      amount: '\u0627\u0644\u0645\u0628\u0644\u063A',
      amountDue: '\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642',
      amountPaid: '\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639',
      amountRemaining: '\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062A\u0628\u0642\u064A',
      noItems: '\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F',
    };
  }

  private localizeItemType(type: InvoiceItemType) {
    const map: Record<InvoiceItemType, string> = {
      SUBSCRIPTION: '\u0627\u0634\u062A\u0631\u0627\u0643',
      COMMISSION: '\u0639\u0645\u0648\u0644\u0629',
      ADJUSTMENT: '\u062A\u0639\u062F\u064A\u0644',
    };
    return map[type] ?? type;
  }

  private localizeStatus(status: string) {
    const map: Record<string, string> = {
      DRAFT: '\u0645\u0633\u0648\u062F\u0629',
      OPEN: '\u0645\u0641\u062A\u0648\u062D\u0629',
      PAID: '\u0645\u062F\u0641\u0648\u0639\u0629',
      VOID: '\u0645\u0644\u063A\u0627\u0629',
    };
    return map[status] ?? status;
  }

  private formatCurrency(amountCents: number, currency: string) {
    const value = (amountCents / 100).toFixed(2);
    return `${this.escapeXml(currency)} ${value}`;
  }

  private formatDate(date?: Date | null) {
    if (!date) return '-';
    return date.toISOString().slice(0, 10);
  }

  private formatPeriod(start?: Date | null, end?: Date | null) {
    if (!start && !end) return '-';
    const startText = start ? this.formatDate(start) : '-';
    const endText = end ? this.formatDate(end) : '-';
    return `${startText} - ${endText}`;
  }

  private escapeXml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
