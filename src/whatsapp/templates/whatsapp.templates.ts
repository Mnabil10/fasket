import { WhatsappTemplatePayload } from '../whatsapp.types';

export type WhatsappTemplateKey =
  | 'order_status_update_v1'
  | 'otp_verification_v1'
  | 'password_reset_v1'
  | 'provider_new_order_v1'
  | 'provider_order_cancelled_v1'
  | 'provider_invoice_ready_v1';

export type WhatsappTemplateLanguage = 'ar' | 'en';

export const WHATSAPP_TEMPLATES: Record<WhatsappTemplateKey, { name: string; variables: readonly string[] }> = {
  order_status_update_v1: {
    name: 'order_status_update_v1',
    variables: ['order_no', 'status', 'eta', 'support_hint'],
  },
  otp_verification_v1: {
    name: 'otp_verification_v1',
    variables: ['otp', 'expires_in'],
  },
  password_reset_v1: {
    name: 'password_reset_v1',
    variables: ['otp', 'reset_link'],
  },
  provider_new_order_v1: {
    name: 'provider_new_order_v1',
    variables: ['order_no', 'items_count', 'total_amount', 'notes'],
  },
  provider_order_cancelled_v1: {
    name: 'provider_order_cancelled_v1',
    variables: ['order_no', 'reason'],
  },
  provider_invoice_ready_v1: {
    name: 'provider_invoice_ready_v1',
    variables: ['invoice_no', 'amount_due', 'due_date'],
  },
};

export function isKnownWhatsappTemplate(value: string): value is WhatsappTemplateKey {
  return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, value);
}

export function normalizeWhatsappLanguage(value?: string): WhatsappTemplateLanguage {
  return value === 'ar' ? 'ar' : 'en';
}

export function buildWhatsappTemplatePayload(
  key: WhatsappTemplateKey,
  language: WhatsappTemplateLanguage,
  variables: Record<string, string | number | null | undefined>,
): WhatsappTemplatePayload {
  const template = WHATSAPP_TEMPLATES[key];
  const params = template.variables.map((variable) => {
    const value = variables[variable];
    return { type: 'text' as const, text: value === null || value === undefined ? '' : String(value) };
  });
  return {
    name: template.name,
    language,
    components: params.length ? [{ type: 'body', parameters: params }] : undefined,
  };
}

export function buildWhatsappTemplatePayloadDynamic(
  name: string,
  language: WhatsappTemplateLanguage,
  variables: Record<string, string | number | null | undefined> | Array<string | number | null | undefined>,
): WhatsappTemplatePayload {
  if (isKnownWhatsappTemplate(name)) {
    return buildWhatsappTemplatePayload(name, language, variables as Record<string, string | number | null | undefined>);
  }
  const values = Array.isArray(variables)
    ? variables
    : Object.values(variables ?? {});
  const params = values.map((value) => ({
    type: 'text' as const,
    text: value === null || value === undefined ? '' : String(value),
  }));
  return {
    name,
    language,
    components: params.length ? [{ type: 'body', parameters: params }] : undefined,
  };
}
