import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AutomationSupportService } from '../../automation-support/automation-support.service';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhoneToE164 } from '../../common/utils/phone.util';
import { cleanString } from '../../common/utils/sanitize.util';
import { WhatsappService } from '../whatsapp.service';
import { WhatsappSupportService } from '../whatsapp-support.service';
import { maskPhone, snippet } from '../utils/redaction.util';
import { verifyWhatsappSignature } from '../utils/signature.util';

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string().optional(),
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z
              .object({
                display_phone_number: z.string().optional(),
                phone_number_id: z.string().optional(),
              })
              .optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string().optional(),
                  profile: z.object({ name: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string().optional(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  timestamp: z.string().optional(),
                  recipient_id: z.string().optional(),
                  errors: z
                    .array(
                      z.object({
                        code: z.number().optional(),
                        title: z.string().optional(),
                        details: z.string().optional(),
                      }),
                    )
                    .optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

const ARABIC_REGEX = /[\u0600-\u06FF]/;
const ORDER_STATUS_AR = /\u0641\u064A\u0646\s*\u0637\u0644\u0628\u064A/;
const CANCEL_AR = /\u0625\u0644\u063A\u0627\u0621/;
const HELP_AR = /\u0645\u0633\u0627\u0639\u062F\u0629/;

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private readonly webhookSecret?: string;
  private readonly provider: 'META' | 'MOCK';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly support: WhatsappSupportService,
    private readonly automationSupport: AutomationSupportService,
  ) {
    this.webhookSecret = this.config.get<string>('WHATSAPP_WEBHOOK_SECRET') || undefined;
    const raw = (this.config.get<string>('WHATSAPP_PROVIDER') || 'mock').toLowerCase();
    this.provider =
      raw === 'meta' || raw === 'message-pro' || raw === 'messagepro' || raw === 'message_pro' ? 'META' : 'MOCK';
  }

  verifyToken(mode?: string, token?: string, challenge?: string) {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN') || '';
    if (!mode || !token || !challenge) return null;
    if (mode !== 'subscribe') return null;
    if (!expected || token !== expected) return null;
    return challenge;
  }

  async handleWebhook(params: { body: any; rawBody?: string; signature?: string; ip?: string }) {
    if (this.webhookSecret) {
      const valid = verifyWhatsappSignature(this.webhookSecret, params.rawBody ?? '', params.signature);
      if (!valid) {
        throw new UnauthorizedException('Invalid WhatsApp signature');
      }
    }

    const parsed = webhookSchema.safeParse(params.body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid WhatsApp webhook payload');
    }

    let processed = 0;
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        const metadata = value.metadata;
        const displayPhone = metadata?.display_phone_number;
        const phoneNumberId = metadata?.phone_number_id;
        if (value.messages?.length) {
          for (const message of value.messages) {
            const handled = await this.handleIncomingMessage({
              message,
              displayPhone,
              phoneNumberId,
              contactName: value.contacts?.[0]?.profile?.name,
            });
            if (handled) processed += 1;
          }
        }
        if (value.statuses?.length) {
          for (const status of value.statuses) {
            await this.handleStatusUpdate(status);
            processed += 1;
          }
        }
      }
    }

    return { processed };
  }

  private async handleIncomingMessage(params: {
    message: { id: string; from: string; type: string; text?: { body: string } };
    displayPhone?: string;
    phoneNumberId?: string;
    contactName?: string;
  }) {
    const rawText = params.message.text?.body ?? '';
    const cleanedText = cleanString(rawText, { maxLength: 1000 });
    const text = typeof cleanedText === 'string' ? cleanedText : '';
    const fromPhone = normalizePhoneToE164(params.message.from);
    const messageType = params.message.type === 'text' ? 'TEXT' : 'DOCUMENT';
    const intent = this.detectIntent(text);
    const lang = this.detectLanguage(text);
    const user = await this.prisma.user.findUnique({ where: { phone: fromPhone }, select: { id: true } });

    const record = await this.support.recordInboundMessage({
      phone: fromPhone,
      userId: user?.id ?? null,
      body: text,
      externalId: params.message.id,
      messageType: messageType as any,
      metadata: {
        waId: params.message.from,
        displayPhone: params.displayPhone ?? null,
        phoneNumberId: params.phoneNumberId ?? null,
        contactName: params.contactName ?? null,
      },
    });

    if (record.duplicate) {
      return false;
    }

    await this.prisma.whatsAppMessageLog.create({
      data: {
        provider: this.provider,
        direction: 'INBOUND',
        type: messageType === 'TEXT' ? 'TEXT' : 'DOCUMENT',
        status: 'RECEIVED',
        fromPhone,
        toPhone: params.displayPhone ?? null,
        providerMessageId: params.message.id,
        body: text ? snippet(text) : null,
        payload: {
          rawType: params.message.type,
          waId: params.message.from,
          contactName: params.contactName ?? null,
        },
        supportConversationId: record.conversation.id,
        supportMessageId: record.message.id,
      },
    });

    await this.handleAutoReply({
      conversationId: record.conversation.id,
      phone: fromPhone,
      text,
      intent,
      lang,
    });

    return true;
  }

  private async handleAutoReply(params: {
    conversationId: string;
    phone: string;
    text: string;
    intent: 'order_status' | 'cancel' | 'help' | 'unknown';
    lang: 'en' | 'ar';
  }) {
    const reply = await this.buildReply(params);
    if (!reply) return;

    const outbound = await this.support.recordOutboundMessage({
      conversationId: params.conversationId,
      body: reply.text,
      metadata: { automated: true, intent: params.intent },
    });

    try {
      await this.whatsapp.sendText({
        to: params.phone,
        body: reply.text,
        supportConversationId: params.conversationId,
        supportMessageId: outbound.id,
        metadata: { automated: true, intent: params.intent },
      });
      await this.support.updateConversationStatus(params.conversationId, reply.status);
    } catch (err) {
      this.logger.warn({
        msg: 'WhatsApp auto-reply send failed',
        phone: maskPhone(params.phone),
        error: (err as Error)?.message,
      });
      await this.support.updateConversationStatus(params.conversationId, 'OPEN');
    }
  }

  private async buildReply(params: {
    conversationId: string;
    phone: string;
    text: string;
    intent: 'order_status' | 'cancel' | 'help' | 'unknown';
    lang: 'en' | 'ar';
  }) {
    if (params.intent === 'order_status') {
      try {
        const lookup = await this.automationSupport.orderStatusLookup({
          phone: params.phone,
        });
        if (!lookup.orders.length) {
          return { text: this.replyText('order_none', params.lang), status: 'OPEN' as const };
        }
        return {
          text: this.renderOrderStatus(lookup.orders, params.lang),
          status: 'RESOLVED' as const,
        };
      } catch (err) {
        this.logger.warn({
          msg: 'WhatsApp order status lookup failed',
          phone: maskPhone(params.phone),
          error: (err as Error)?.message,
        });
        return { text: this.replyText('order_error', params.lang), status: 'OPEN' as const };
      }
    }

    if (params.intent === 'cancel') {
      return { text: this.replyText('cancel', params.lang), status: 'OPEN' as const };
    }

    if (params.intent === 'help') {
      return { text: this.replyText('help', params.lang), status: 'OPEN' as const };
    }

    return { text: this.replyText('unknown', params.lang), status: 'OPEN' as const };
  }

  private renderOrderStatus(orders: any[], lang: 'en' | 'ar') {
    if (!orders.length) return this.replyText('order_none', lang);
    const lines = orders.map((order) => {
      const status = this.localizeStatus(order.status, lang);
      const eta = order.etaMinutes ? this.localizeEta(order.etaMinutes, lang) : this.replyText('eta_unknown', lang);
      return lang === 'ar'
        ? `\u0637\u0644\u0628 ${order.orderCode}: ${status}. ${eta}`
        : `Order ${order.orderCode}: ${status}. ${eta}`;
    });
    return lines.join('\n');
  }

  private localizeStatus(status: string, lang: 'en' | 'ar') {
    const mapping: Record<string, { en: string; ar: string }> = {
      PENDING: { en: 'Pending', ar: '\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631' },
      CONFIRMED: { en: 'Confirmed', ar: '\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0637\u0644\u0628' },
      PREPARING: { en: 'Preparing', ar: '\u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631' },
      OUT_FOR_DELIVERY: { en: 'Out for delivery', ar: '\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642' },
      DELIVERY_FAILED: { en: 'Delivery failed', ar: '\u0641\u0634\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      DELIVERED: { en: 'Delivered', ar: '\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644' },
      CANCELED: { en: 'Canceled', ar: '\u062A\u0645 \u0627\u0644\u0625\u0644\u063A\u0627\u0621' },
    };
    const entry = mapping[status] ?? { en: status, ar: status };
    return lang === 'ar' ? entry.ar : entry.en;
  }

  private localizeEta(minutes: number, lang: 'en' | 'ar') {
    if (!minutes || minutes <= 0) return this.replyText('eta_unknown', lang);
    if (lang === 'ar') {
      return `\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u062A\u0648\u0642\u0639: ${minutes} \u062F\u0642\u064A\u0642\u0629`;
    }
    return `ETA: ${minutes} min`;
  }

  private replyText(key: string, lang: 'en' | 'ar') {
    const dictionary = {
      en: {
        order_none: 'We could not find a recent order for this phone.',
        order_error: 'We could not fetch your order status right now. A support agent will follow up.',
        eta_unknown: 'ETA unavailable',
        cancel: 'We received your cancellation request. A support agent will contact you shortly.',
        help: 'Thanks! A support agent will contact you shortly.',
        unknown: 'Thanks for reaching out. A support agent will contact you shortly.',
      },
      ar: {
        order_none: '\u0644\u0645 \u0646\u062C\u062F \u0637\u0644\u0628\u0627\u062A \u062D\u062F\u064A\u062B\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645.',
        order_error: '\u0644\u0645 \u0646\u062A\u0645\u0643\u0646 \u0645\u0646 \u062C\u0644\u0628 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0622\u0646. \u0633\u064A\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0645\u0648\u0638\u0641 \u0627\u0644\u062F\u0639\u0645.',
        eta_unknown: '\u0627\u0644\u0648\u0642\u062A \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631',
        cancel: '\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628 \u0627\u0644\u0625\u0644\u063A\u0627\u0621. \u0633\u064A\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0645\u0648\u0638\u0641 \u0627\u0644\u062F\u0639\u0645 \u0642\u0631\u064A\u0628\u0627\u064B.',
        help: '\u0634\u0643\u0631\u0627\u064B! \u0633\u064A\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0645\u0648\u0638\u0641 \u0627\u0644\u062F\u0639\u0645 \u0642\u0631\u064A\u0628\u0627\u064B.',
        unknown: '\u0634\u0643\u0631\u0627\u064B \u0644\u062A\u0648\u0627\u0635\u0644\u0643. \u0633\u064A\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0645\u0648\u0638\u0641 \u0627\u0644\u062F\u0639\u0645 \u0642\u0631\u064A\u0628\u0627\u064B.',
      },
    } as const;
    return (lang === 'ar' ? dictionary.ar : dictionary.en)[key as keyof typeof dictionary.en] || '';
  }

  private detectIntent(text: string) {
    const normalized = text.toLowerCase();
    if (ORDER_STATUS_AR.test(text) || normalized.includes('where is my order') || normalized.includes('order status')) {
      return 'order_status' as const;
    }
    if (CANCEL_AR.test(text) || normalized.includes('cancel')) {
      return 'cancel' as const;
    }
    if (HELP_AR.test(text) || normalized.includes('help')) {
      return 'help' as const;
    }
    return 'unknown' as const;
  }

  private detectLanguage(text: string): 'en' | 'ar' {
    return ARABIC_REGEX.test(text) ? 'ar' : 'en';
  }

  private async handleStatusUpdate(status: {
    id: string;
    status: string;
    errors?: Array<{ code?: number; title?: string; details?: string }>;
  }) {
    const mapped = this.mapStatus(status.status);
    const error = status.errors?.[0];
    await this.prisma.whatsAppMessageLog.updateMany({
      where: { providerMessageId: status.id },
      data: {
        status: mapped,
        errorCode: error?.code ? String(error.code) : null,
        errorMessage: error?.title || error?.details || null,
      },
    });
  }

  private mapStatus(status: string) {
    switch (status) {
      case 'sent':
        return 'SENT';
      case 'delivered':
        return 'DELIVERED';
      case 'read':
        return 'READ';
      case 'failed':
        return 'FAILED';
      default:
        return 'SENT';
    }
  }
}
