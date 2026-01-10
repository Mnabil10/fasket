export type WhatsappProvider = 'mock' | 'meta';

export type WhatsappJobType = 'SEND_TEMPLATE' | 'SEND_TEXT' | 'SEND_DOCUMENT';

export interface WhatsappTemplateDefinition {
  name: string;
  variables: readonly string[];
}

export interface WhatsappTemplatePayload {
  name: string;
  language: string;
  components?: Array<{
    type: 'body';
    parameters: Array<{ type: 'text'; text: string }>;
  }>;
}

export interface WhatsappDocumentPayload {
  link: string;
  filename?: string;
}

export interface WhatsappQueueJob {
  type: WhatsappJobType;
  logId: string;
  to: string;
  template?: WhatsappTemplatePayload;
  text?: string;
  document?: WhatsappDocumentPayload;
}

export interface WhatsappSendResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
  raw?: unknown;
}
