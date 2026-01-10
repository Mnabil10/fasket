import { forwardRef, Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { OtpPublicController } from './otp-public.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AutomationModule } from '../automation/automation.module';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AutomationModule, TelegramModule, NotificationsModule],
  controllers: [OtpController, OtpPublicController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
