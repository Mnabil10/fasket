import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SignupDebugController } from './signup-debug.controller';
import { AuthCompatController } from './auth-compat.controller';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { TwoFaGuard } from '../common/guards/twofa.guard';
import { PasswordResetModule } from '../password-reset/password-reset.module';
import { OtpModule } from '../otp/otp.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    forwardRef(() => PasswordResetModule),
    forwardRef(() => OtpModule),
    forwardRef(() => TelegramModule),
  ],
  controllers: [AuthController, AuthCompatController, SignupDebugController],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy, AuthRateLimitService, TwoFaGuard],
  exports: [AuthService],
})
export class AuthModule {}
