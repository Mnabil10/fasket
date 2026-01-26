import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import FormData = require('form-data');
import { basename } from 'path';
import { lookup as lookupMime } from 'mime-types';
import { WhatsappDocumentPayload, WhatsappSendResult, WhatsappTemplatePayload } from '../whatsapp.types';
import { renderWhatsappTemplateText } from '../templates/whatsapp.template-text';
import { toWhatsappRecipient } from '../utils/phone.util';

type MessageProResponse = AxiosResponse<any>;

@Injectable()
export class MessageProClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly instanceId?: string;
  private readonly chatIdSuffix?: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      (this.config.get<string>('WHATSAPP_MESSAGE_PRO_BASE_URL') || 'https://api.message-pro.com/api/v2').replace(
        /\/+$/,
        '',
      );
    this.token = this.config.get<string>('WHATSAPP_MESSAGE_PRO_TOKEN') || undefined;
    this.instanceId = this.config.get<string>('WHATSAPP_MESSAGE_PRO_INSTANCE_ID') || undefined;
    this.chatIdSuffix = this.config.get<string>('WHATSAPP_MESSAGE_PRO_CHAT_ID_SUFFIX') || undefined;
    const timeoutValue = Number(this.config.get<string>('WHATSAPP_MESSAGE_PRO_TIMEOUT_MS') ?? 7000);
    this.timeoutMs = Number.isFinite(timeoutValue) ? timeoutValue : 7000;
  }

  get enabled() {
    return Boolean(this.token);
  }

  get canSend() {
    return Boolean(this.token && this.instanceId);
  }

  async sendTemplate(to: string, template: WhatsappTemplatePayload, sendAt?: string): Promise<WhatsappSendResult> {
    const body = renderWhatsappTemplateText(template);
    if (!body) {
      return { messageId: '', status: 'failed', error: 'template_body_empty' };
    }
    return this.sendText(to, body, sendAt);
  }

  async sendText(to: string, body: string, sendAt?: string): Promise<WhatsappSendResult> {
    if (!this.canSend) {
      return { messageId: '', status: 'failed', error: 'WHATSAPP_MESSAGE_PRO credentials missing' };
    }
    const instanceId = encodeURIComponent(this.instanceId as string);
    const chatId = this.resolveChatId(to);
    if (!body?.trim()) {
      return { messageId: '', status: 'failed', error: 'text_missing' };
    }
    const response = await this.postJson(`/${instanceId}/send-message`, {
      chat_id: chatId,
      text: body,
      ...(sendAt ? { send_at: sendAt } : {}),
    });
    return this.normalizeSendResponse(response);
  }

  async sendDocument(to: string, document: WhatsappDocumentPayload, sendAt?: string): Promise<WhatsappSendResult> {
    if (!this.canSend) {
      return { messageId: '', status: 'failed', error: 'WHATSAPP_MESSAGE_PRO credentials missing' };
    }
    if (!document?.link) {
      return { messageId: '', status: 'failed', error: 'document_link_missing' };
    }
    const instanceId = encodeURIComponent(this.instanceId as string);
    const chatId = this.resolveChatId(to);
    const filename = this.resolveFilename(document.link, document.filename);
    const fileResponse = await axios.get(document.link, {
      responseType: 'stream',
      timeout: Math.max(this.timeoutMs, 12000),
      validateStatus: () => true,
    });
    if (fileResponse.status < 200 || fileResponse.status >= 300) {
      return {
        messageId: '',
        status: 'failed',
        error: this.extractErrorMessage(fileResponse.data, fileResponse.status) || 'document_fetch_failed',
      };
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    const contentType =
      (typeof fileResponse.headers?.['content-type'] === 'string' && fileResponse.headers['content-type']) ||
      lookupMime(filename) ||
      'application/octet-stream';
    form.append('media', fileResponse.data, {
      filename,
      contentType,
    });
    if (sendAt) {
      form.append('send_at', sendAt);
    }

    const response = await this.postForm(`/${instanceId}/send-file`, form);
    return this.normalizeSendResponse(response);
  }

  async listInstances() {
    return this.getJson('/instances');
  }

  async getInstanceDetails(instanceId: string) {
    return this.getJson(`/instances/${encodeURIComponent(instanceId)}`);
  }

  async getInstanceStatus(instanceId: string) {
    return this.getJson(`/instances/${encodeURIComponent(instanceId)}/status`);
  }

  async startInstance(instanceId: string) {
    return this.postJsonStrict(`/instances/${encodeURIComponent(instanceId)}/start`, {});
  }

  async restartInstance(instanceId: string) {
    return this.postJsonStrict(`/instances/${encodeURIComponent(instanceId)}/restart`, {});
  }

  async logoutInstance(instanceId: string) {
    return this.postJsonStrict(`/instances/${encodeURIComponent(instanceId)}/logout`, {});
  }

  async troubleshootInstance(instanceId: string) {
    return this.postJsonStrict(`/instances/${encodeURIComponent(instanceId)}/troubleshoot`, {});
  }

  async getQrCode(instanceId: string) {
    return this.getJson(`/instances/${encodeURIComponent(instanceId)}/qr-code`);
  }

  async getScreenshot(instanceId: string) {
    return this.getJson(`/instances/${encodeURIComponent(instanceId)}/screenshot`);
  }

  async getQueueSettings(instanceId: string) {
    return this.getJson(`/instances/${encodeURIComponent(instanceId)}/queue-settings`);
  }

  async updateQueueSettings(instanceId: string, payload: Record<string, unknown>) {
    return this.putJson(`/instances/${encodeURIComponent(instanceId)}/queue-settings`, payload);
  }

  async listMessages(instanceId: string, params?: Record<string, unknown>) {
    return this.getJson(`/${encodeURIComponent(instanceId)}/messages`, params);
  }

  async getMessageDetails(instanceId: string, messageId: string) {
    return this.getJson(`/${encodeURIComponent(instanceId)}/messages/${encodeURIComponent(messageId)}`);
  }

  async retryAllMessages(instanceId: string, payload: Record<string, unknown> = {}) {
    return this.postJsonStrict(`/${encodeURIComponent(instanceId)}/messages/retry-all`, payload);
  }

  async retryMessage(instanceId: string, messageId: string, payload: Record<string, unknown> = {}) {
    return this.postJsonStrict(
      `/${encodeURIComponent(instanceId)}/messages/${encodeURIComponent(messageId)}/retry`,
      payload,
    );
  }

  async sendImage(instanceId: string, form: FormData) {
    return this.postForm(`/${encodeURIComponent(instanceId)}/send-image`, form);
  }

  async sendVideo(instanceId: string, form: FormData) {
    return this.postForm(`/${encodeURIComponent(instanceId)}/send-video`, form);
  }

  async sendFile(instanceId: string, form: FormData) {
    return this.postForm(`/${encodeURIComponent(instanceId)}/send-file`, form);
  }

  async sendList(instanceId: string, payload: Record<string, unknown>) {
    return this.postJsonStrict(`/${encodeURIComponent(instanceId)}/send-list`, payload);
  }

  async listCampaigns() {
    return this.getJson('/campaigns');
  }

  async createCampaign(payload: Record<string, unknown>) {
    return this.postJsonStrict('/campaigns', payload);
  }

  async updateCampaignDelay(campaignId: string, payload: Record<string, unknown>) {
    return this.patchJson(`/campaigns/${encodeURIComponent(campaignId)}/delay`, payload);
  }

  async getCampaignDelay(campaignId: string) {
    return this.getJson(`/campaigns/${encodeURIComponent(campaignId)}/delay`);
  }

  async finishCampaign(campaignId: string, payload: Record<string, unknown>) {
    return this.patchJson(`/campaigns/${encodeURIComponent(campaignId)}/finish`, payload);
  }

  async copyCampaign(campaignId: string, payload: Record<string, unknown>) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/copy`, payload);
  }

  async listCampaignMessages(campaignId: string) {
    return this.getJson(`/campaigns/${encodeURIComponent(campaignId)}/messages`);
  }

  async campaignStats(campaignId: string) {
    return this.getJson(`/campaigns/${encodeURIComponent(campaignId)}/messages/stats`);
  }

  async campaignQueue(campaignId: string) {
    return this.getJson(`/campaigns/${encodeURIComponent(campaignId)}/messages/queue`);
  }

  async campaignDone(campaignId: string) {
    return this.getJson(`/campaigns/${encodeURIComponent(campaignId)}/messages/done`);
  }

  async campaignAddMessages(campaignId: string, payload: Record<string, unknown>) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/messages`, payload);
  }

  async campaignDeleteMessages(campaignId: string, payload: Record<string, unknown>) {
    return this.deleteJson(`/campaigns/${encodeURIComponent(campaignId)}/messages`, payload);
  }

  async campaignStart(campaignId: string, payload: Record<string, unknown> = {}) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/start`, payload);
  }

  async campaignSchedule(campaignId: string, payload: Record<string, unknown>) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/schedule`, payload);
  }

  async campaignUnschedule(campaignId: string) {
    return this.deleteJson(`/campaigns/${encodeURIComponent(campaignId)}/schedule`);
  }

  async campaignPause(campaignId: string, payload: Record<string, unknown> = {}) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/pause`, payload);
  }

  async campaignResetFailed(campaignId: string, payload: Record<string, unknown> = {}) {
    return this.postJsonStrict(`/campaigns/${encodeURIComponent(campaignId)}/reset-failed`, payload);
  }

  async getChatIdByLid(instanceId: string, lid: string) {
    return this.getJson(`/${encodeURIComponent(instanceId)}/lids/${encodeURIComponent(lid)}`);
  }

  async getLidByPhone(instanceId: string, phoneNumber: string) {
    return this.getJson(`/${encodeURIComponent(instanceId)}/lids/pn/${encodeURIComponent(phoneNumber)}`);
  }

  private resolveChatId(phone: string) {
    const recipient = toWhatsappRecipient(phone);
    const base = recipient.waId;
    return this.chatIdSuffix ? `${base}${this.chatIdSuffix}` : base;
  }

  private resolveFilename(link: string, fallback?: string) {
    const trimmed = fallback?.trim();
    if (trimmed) return trimmed;
    try {
      const url = new URL(link);
      const name = basename(url.pathname);
      if (name) return name;
    } catch {
      // ignore
    }
    return `document-${Date.now()}`;
  }

  private buildUrl(path: string) {
    const trimmed = path.replace(/^\/+/, '');
    return `${this.baseUrl}/${trimmed}`;
  }

  private buildHeaders() {
    if (!this.token) return {};
    return { token: this.token };
  }

  private extractMessageId(data: any) {
    return (
      data?.message_id ??
      data?.messageId ??
      data?.id ??
      data?.data?.message_id ??
      data?.data?.id ??
      ''
    );
  }

  private extractErrorMessage(data: any, status?: number) {
    const error =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      data?.details ||
      data?.status ||
      null;
    if (error) return String(error);
    if (status) return `HTTP_${status}`;
    return null;
  }

  private normalizeSendResponse(response: MessageProResponse): WhatsappSendResult {
    if (response.status >= 200 && response.status < 300) {
      return {
        messageId: this.extractMessageId(response.data),
        status: 'sent',
        raw: response.data,
      };
    }
    return {
      messageId: '',
      status: 'failed',
      error: this.extractErrorMessage(response.data, response.status) || 'send_failed',
      raw: response.data,
    };
  }

  private ensureToken() {
    if (!this.token) {
      throw new Error('WHATSAPP_MESSAGE_PRO_TOKEN is missing');
    }
  }

  private async getJson(path: string, params?: Record<string, unknown>) {
    this.ensureToken();
    const response = await axios.get(this.buildUrl(path), {
      params,
      headers: this.buildHeaders(),
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.extractErrorMessage(response.data, response.status) || 'request_failed');
    }
    return response.data;
  }

  private async postJson(path: string, payload: Record<string, unknown>): Promise<MessageProResponse> {
    return axios.post(this.buildUrl(path), payload, {
      headers: {
        ...this.buildHeaders(),
        'content-type': 'application/json',
      },
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
  }

  private async postJsonStrict(path: string, payload: Record<string, unknown>) {
    this.ensureToken();
    const response = await this.postJson(path, payload);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.extractErrorMessage(response.data, response.status) || 'request_failed');
    }
    return response.data;
  }

  private async putJson(path: string, payload: Record<string, unknown>) {
    this.ensureToken();
    const response = await axios.put(this.buildUrl(path), payload, {
      headers: {
        ...this.buildHeaders(),
        'content-type': 'application/json',
      },
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.extractErrorMessage(response.data, response.status) || 'request_failed');
    }
    return response.data;
  }

  private async patchJson(path: string, payload: Record<string, unknown>) {
    this.ensureToken();
    const response = await axios.patch(this.buildUrl(path), payload, {
      headers: {
        ...this.buildHeaders(),
        'content-type': 'application/json',
      },
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.extractErrorMessage(response.data, response.status) || 'request_failed');
    }
    return response.data;
  }

  private async deleteJson(path: string, payload?: Record<string, unknown>) {
    this.ensureToken();
    const response = await axios.delete(this.buildUrl(path), {
      data: payload,
      headers: {
        ...this.buildHeaders(),
        'content-type': 'application/json',
      },
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.extractErrorMessage(response.data, response.status) || 'request_failed');
    }
    return response.data;
  }

  private async postForm(path: string, form: FormData): Promise<MessageProResponse> {
    return axios.post(this.buildUrl(path), form, {
      headers: {
        ...this.buildHeaders(),
        ...form.getHeaders(),
      },
      timeout: Math.max(this.timeoutMs, 15000),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
  }
}
