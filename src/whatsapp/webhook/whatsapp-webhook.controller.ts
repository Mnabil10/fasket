import { Body, Controller, ForbiddenException, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@ApiTags('Webhooks')
@Controller({ path: 'webhooks/whatsapp', version: ['1', '2'] })
export class WhatsappWebhookController {
  constructor(private readonly webhook: WhatsappWebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const result = this.webhook.verifyToken(mode, token, challenge);
    if (!result) {
      throw new ForbiddenException('Invalid verification token');
    }
    return result;
  }

  @Post()
  @Throttle({ whatsappWebhook: {} })
  async handle(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    await this.webhook.handleWebhook({
      body,
      rawBody: (req as any).rawBody,
      signature: signature ?? undefined,
      ip: req.ip,
    });
    return { success: true };
  }
}
