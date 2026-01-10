import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WhatsappDocumentPayload, WhatsappSendResult, WhatsappTemplatePayload } from '../whatsapp.types';
import { toWhatsappRecipient } from '../utils/phone.util';

@Injectable()
export class MetaCloudClient {
  private readonly apiBaseUrl: string;
  private readonly apiVersion: string;
  private readonly phoneNumberId?: string;
  private readonly accessToken?: string;

  constructor(private readonly config: ConfigService) {
    this.apiBaseUrl = this.config.get<string>('WHATSAPP_API_BASE_URL') || 'https://graph.facebook.com';
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION') || 'v20.0';
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') || undefined;
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN') || undefined;
  }

  async sendTemplate(to: string, template: WhatsappTemplatePayload): Promise<WhatsappSendResult> {
    const recipient = toWhatsappRecipient(to);
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient.waId,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.components,
      },
    };
    return this.post(payload);
  }

  async sendText(to: string, body: string): Promise<WhatsappSendResult> {
    const recipient = toWhatsappRecipient(to);
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient.waId,
      type: 'text',
      text: { body, preview_url: false },
    };
    return this.post(payload);
  }

  async sendDocument(to: string, document: WhatsappDocumentPayload): Promise<WhatsappSendResult> {
    const recipient = toWhatsappRecipient(to);
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient.waId,
      type: 'document',
      document: {
        link: document.link,
        filename: document.filename,
      },
    };
    return this.post(payload);
  }

  private async post(payload: Record<string, any>): Promise<WhatsappSendResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { messageId: '', status: 'failed', error: 'WHATSAPP credentials missing' };
    }
    const url = `${this.apiBaseUrl.replace(/\/+$/, '')}/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      timeout: 7000,
      validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 300) {
      const messageId = response.data?.messages?.[0]?.id ?? response.data?.message_id ?? '';
      return { messageId, status: 'sent', raw: response.data };
    }
    const error = response.data?.error?.message || `HTTP_${response.status}`;
    return { messageId: '', status: 'failed', error, raw: response.data };
  }
}
