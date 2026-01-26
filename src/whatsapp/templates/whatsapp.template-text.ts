import { WhatsappTemplatePayload } from '../whatsapp.types';
import {
  WHATSAPP_TEMPLATES,
  WhatsappTemplateKey,
  WhatsappTemplateLanguage,
  normalizeWhatsappLanguage,
} from './whatsapp.templates';

const TEMPLATE_TEXTS: Record<WhatsappTemplateKey, Record<WhatsappTemplateLanguage, string>> = {
  order_status_update_v1: {
    en: 'Order {{order_no}}: {{status}}. {{eta}}. {{support_hint}}',
    ar: '\u0637\u0644\u0628 {{order_no}}: {{status}}. {{eta}}. {{support_hint}}',
  },
  otp_verification_v1: {
    en: 'Your verification code is {{otp}}. It expires in {{expires_in}} minutes.',
    ar: '\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0647\u0648 {{otp}}. \u064A\u0646\u062A\u0647\u064A \u062E\u0644\u0627\u0644 {{expires_in}} \u062F\u0642\u064A\u0642\u0629.',
  },
  password_reset_v1: {
    en: 'Use code {{otp}} to reset your password. Reset link: {{reset_link}}',
    ar: '\u0627\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0631\u0645\u0632 {{otp}} \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631. \u0631\u0627\u0628\u0637 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646: {{reset_link}}',
  },
  provider_new_order_v1: {
    en: 'New order {{order_no}} ({{items_count}} items). Total: {{total_amount}}. Notes: {{notes}}',
    ar: '\u0637\u0644\u0628 \u062C\u062F\u064A\u062F {{order_no}} ({{items_count}} \u0639\u0646\u0627\u0635\u0631). \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A: {{total_amount}}. \u0645\u0644\u0627\u062D\u0638\u0627\u062A: {{notes}}',
  },
  provider_order_cancelled_v1: {
    en: 'Order {{order_no}} was canceled. Reason: {{reason}}',
    ar: '\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0637\u0644\u0628 {{order_no}}. \u0627\u0644\u0633\u0628\u0628: {{reason}}',
  },
  provider_invoice_ready_v1: {
    en: 'Invoice {{invoice_no}} is ready. Amount due: {{amount_due}}. Due date: {{due_date}}',
    ar: '\u0641\u0627\u062A\u0648\u0631\u0629 {{invoice_no}} \u062C\u0627\u0647\u0632\u0629. \u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642: {{amount_due}}. \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642: {{due_date}}',
  },
};

type VariableMap = Record<string, string>;

const PLACEHOLDER_REGEX = /\{\{\s*([\w.-]+)\s*\}\}/g;

function interpolate(template: string, variables: VariableMap) {
  return template.replace(PLACEHOLDER_REGEX, (_match, key) => variables[key] ?? '');
}

function extractTemplateVariables(payload: WhatsappTemplatePayload): VariableMap {
  const values =
    payload.components?.[0]?.parameters?.map((param) =>
      typeof param.text === 'string' ? param.text : '',
    ) ?? [];
  const definition = WHATSAPP_TEMPLATES[payload.name as WhatsappTemplateKey];
  const variables: VariableMap = {};

  if (definition) {
    definition.variables.forEach((key, index) => {
      variables[key] = values[index] ?? '';
    });
    return variables;
  }

  values.forEach((value, index) => {
    variables[`var${index + 1}`] = value ?? '';
  });
  return variables;
}

export function renderWhatsappTemplateText(payload: WhatsappTemplatePayload): string {
  const language = normalizeWhatsappLanguage(payload.language);
  const variables = extractTemplateVariables(payload);
  const templateKey = payload.name as WhatsappTemplateKey;
  const template = TEMPLATE_TEXTS[templateKey]?.[language];

  if (template) {
    return interpolate(template, variables).trim();
  }

  const entries = Object.entries(variables).filter(([, value]) => value);
  if (entries.length) {
    return entries.map(([key, value]) => `${key}: ${value}`).join('\n').trim();
  }

  return payload.name;
}
