import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Request } from 'express';
import { TelegramService } from './telegram.service';
import { AuthService } from '../auth/auth.service';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

class ConfirmLinkDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  linkToken?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  signupSessionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()
  signupSessionToken?: string;
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
  private readonly logger = new Logger(TelegramInternalController.name);

  constructor(private readonly telegram: TelegramService, private readonly auth: AuthService) {}

  @Post('confirm-link')
  async confirmLink(@Body() dto: ConfirmLinkDto) {
    const correlationId = (dto as any)?.correlationId || undefined;
    this.logger.debug({ msg: 'confirm-link called', correlationId, chatId: dto.telegramChatId });
    try {
      const sessionResult = await this.auth.signupConfirmLinkToken(
        dto.linkToken?.trim(),
        {
          chatId: this.toBigInt(dto.telegramChatId, 'telegramChatId'),
          telegramUserId: dto.telegramUserId ? this.toBigInt(dto.telegramUserId, 'telegramUserId') : undefined,
          telegramUsername: dto.telegramUsername?.trim(),
        },
        { signupSessionId: dto.signupSessionId, signupSessionToken: dto.signupSessionToken },
      );
      if (sessionResult && (sessionResult as any).success !== undefined) {
        this.logger.debug({ msg: 'confirm-link linked signup session', correlationId, chatId: dto.telegramChatId });
        return sessionResult;
      }

      if (!dto.linkToken) {
        return { success: false, error: 'TOKEN_INVALID' };
      }
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
      this.logger.debug({ msg: 'confirm-link linked existing user', correlationId, chatId: dto.telegramChatId, userId: token.userId });
      return { success: true };
    } catch (err) {
      const { error, message } = this.mapError(err);
      this.logger.warn({ msg: 'confirm-link failed', correlationId, error, chatId: dto.telegramChatId });
      return { success: false, error, message };
    }
  }

  private toBigInt(value: string, field: string) {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid integer`);
    }
  }

  private mapError(err: unknown): { error: string; message: string } {
    const msg = (err as Error)?.message ?? '';
    const allowed = ['TOKEN_INVALID', 'TOKEN_EXPIRED', 'TOKEN_USED', 'CHAT_ALREADY_LINKED', 'USER_NOT_FOUND', 'UNAUTHORIZED'];
    const matched = allowed.find((code) => msg.includes(code));
    if (matched) return { error: matched, message: msg };
    if (msg.toLowerCase().includes('not found')) return { error: 'USER_NOT_FOUND', message: msg };
    if (msg.toLowerCase().includes('unauthorized')) return { error: 'UNAUTHORIZED', message: msg };
    return { error: 'TOKEN_INVALID', message: msg || 'Invalid token' };
  }
}

@ApiTags('Internal')
@UseGuards(InternalSecretGuard)
@Controller({ path: 'internal/health', version: ['1', '2'] })
export class InternalHealthController {
  private readonly placeholder = 'PUT_A_STRONG_SECRET_HERE';

  constructor(private readonly config: ConfigService) {}

  @Get('secrets')
  async secrets() {
    const secret =
      this.config.get<string>('INTERNAL_TELEGRAM_SECRET') ||
      this.config.get<string>('INTERNAL_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      '';
    const configured = Boolean(secret) && secret !== this.placeholder;
    return { internalTelegramSecretConfigured: configured };
  }
}
