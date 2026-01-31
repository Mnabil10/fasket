import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { StaffOrAdmin } from '../admin/_admin-guards';
import { MessageProClient } from './clients/message-pro.client';

@ApiTags('Admin/WhatsApp')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/whatsapp/instances', version: ['1'] })
export class WhatsappInstanceController {
  private readonly provider: string;

  constructor(
    private readonly messagePro: MessageProClient,
    private readonly config: ConfigService,
  ) {
    this.provider = (this.config.get<string>('WHATSAPP_PROVIDER') || 'mock').toLowerCase();
  }

  @Get()
  async listInstances() {
    if (!this.isMessagePro()) {
      return { items: [], raw: null, provider: this.provider, supported: false };
    }
    try {
      const data = await this.messagePro.listInstances();
      const items = Array.isArray(data) ? data : data?.instances ?? data?.data ?? [];
      return { items, raw: data, provider: this.provider, supported: true };
    } catch (err) {
      const message = (err as Error)?.message || 'request_failed';
      const instanceId = (this.config.get<string>('WHATSAPP_MESSAGE_PRO_INSTANCE_ID') || '').trim();
      if (instanceId && /instance id is missing/i.test(message)) {
        const fallback = await this.safe(() => this.messagePro.getInstanceDetails(instanceId));
        const item = fallback?.instance ?? fallback?.data ?? fallback;
        const items = item ? [item] : [];
        return { items, raw: fallback, provider: this.provider, supported: true };
      }
      throw new BadRequestException(message);
    }
  }

  @Get(':id')
  async getInstance(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.getInstanceDetails(id));
    return { data };
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.getInstanceStatus(id));
    return { data };
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.startInstance(id));
    return { data };
  }

  @Post(':id/restart')
  async restart(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.restartInstance(id));
    return { data };
  }

  @Post(':id/logout')
  async logout(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.logoutInstance(id));
    return { data };
  }

  @Post(':id/troubleshoot')
  async troubleshoot(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.troubleshootInstance(id));
    return { data };
  }

  @Get(':id/qr-code')
  async getQrCode(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.getQrCode(id));
    return { data };
  }

  @Get(':id/screenshot')
  async getScreenshot(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.getScreenshot(id));
    return { data };
  }

  @Get(':id/queue-settings')
  async getQueueSettings(@Param('id') id: string) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.getQueueSettings(id));
    return { data };
  }

  @Put(':id/queue-settings')
  async updateQueueSettings(@Param('id') id: string, @Body() payload: Record<string, unknown>) {
    this.ensureMessagePro();
    const data = await this.safe(() => this.messagePro.updateQueueSettings(id, payload ?? {}));
    return { data };
  }

  private ensureMessagePro() {
    if (!this.isMessagePro()) {
      throw new BadRequestException('WhatsApp provider is not message-pro');
    }
  }

  private isMessagePro() {
    return this.provider === 'message-pro' || this.provider === 'messagepro' || this.provider === 'message_pro';
  }

  private async safe<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (err) {
      const message = (err as Error)?.message || 'request_failed';
      throw new BadRequestException(message);
    }
  }
}
