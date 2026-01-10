import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WhatsappDocumentPayload, WhatsappSendResult, WhatsappTemplatePayload } from '../whatsapp.types';

@Injectable()
export class MockWhatsappClient {
  async sendTemplate(_to: string, _template: WhatsappTemplatePayload): Promise<WhatsappSendResult> {
    return { messageId: `mock-${randomUUID()}`, status: 'sent' };
  }

  async sendText(_to: string, _body: string): Promise<WhatsappSendResult> {
    return { messageId: `mock-${randomUUID()}`, status: 'sent' };
  }

  async sendDocument(_to: string, _document: WhatsappDocumentPayload): Promise<WhatsappSendResult> {
    return { messageId: `mock-${randomUUID()}`, status: 'sent' };
  }
}
