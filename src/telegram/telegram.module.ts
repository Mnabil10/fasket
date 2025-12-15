import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController, TelegramInternalController } from './telegram.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule, ConfigModule],
  providers: [TelegramService],
  controllers: [TelegramController, TelegramInternalController],
  exports: [TelegramService],
})
export class TelegramModule {}
