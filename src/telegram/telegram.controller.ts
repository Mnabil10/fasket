import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Request } from 'express';
import { TelegramService } from './telegram.service';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class ConfirmLinkDto {
  @ApiProperty() @IsString()
  linkToken!: string;
  @ApiProperty() @Matches(/^\d+$/, { message: 'telegramChatId must be numeric' })
  telegramChatId!: string;
  @ApiProperty({ required: false }) @IsOptional() @Matches(/^\d+$/, { message: 'telegramUserId must be numeric' })
  telegramUserId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  telegramUsername?: string;
}

@ApiTags('Telegram')
@Controller({ path: 'telegram', version: ['1', '2'] })
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('link-token')
  @UseGuards(JwtAuthGuard)
  async createToken(@Req() req: Request) {
    const token = await this.telegram.createLinkToken((req as any).user.userId);
    return { deeplink: token.deeplink, expiresInMinutes: token.expiresInMinutes };
  }
}

@ApiTags('Internal')
@UseGuards(InternalSecretGuard)
@Controller({ path: 'internal/telegram', version: ['1', '2'] })
export class TelegramInternalController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('confirm-link')
  async confirmLink(@Body() dto: ConfirmLinkDto) {
    try {
      const token = await this.telegram.consumeLinkToken(dto.linkToken.trim());
      const telegramChatId = this.toBigInt(dto.telegramChatId, 'telegramChatId');
      const telegramUserId = dto.telegramUserId ? this.toBigInt(dto.telegramUserId, 'telegramUserId') : undefined;

      const chatLink = await this.telegram.getLinkByChatId(telegramChatId);
      if (chatLink && chatLink.userId !== token.userId) {
        return { success: false, error: 'CHAT_ALREADY_LINKED' };
      }
      const phoneLink = await this.telegram.getActiveLinkByPhone(token.phoneE164);
      if (phoneLink && phoneLink.userId !== token.userId) {
        return { success: false, error: 'CHAT_ALREADY_LINKED' };
      }

      await this.telegram.link({
        userId: token.userId,
        phoneE164: token.phoneE164,
        telegramChatId,
        telegramUserId,
        telegramUsername: dto.telegramUsername?.trim(),
      });
      return { success: true };
    } catch (err) {
      const code = (err as Error)?.message || 'TOKEN_INVALID';
      if (['TOKEN_EXPIRED', 'TOKEN_USED', 'TOKEN_INVALID'].includes(code)) {
        return { success: false, error: code };
      }
      if (code.includes('Telegram chat already linked')) {
        return { success: false, error: 'CHAT_ALREADY_LINKED' };
      }
      throw err;
    }
  }

  private toBigInt(value: string, field: string) {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid integer`);
    }
  }
}
