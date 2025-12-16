import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController, TelegramInternalController, InternalHealthController } from './telegram.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, CommonModule, ConfigModule, forwardRef(() => AuthModule)],
  providers: [TelegramService],
  controllers: [TelegramController, TelegramInternalController, InternalHealthController],
  exports: [TelegramService],
})
export class TelegramModule {}
