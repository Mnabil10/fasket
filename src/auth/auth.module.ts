import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthCompatController } from './auth-compat.controller';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { TwoFaGuard } from '../common/guards/twofa.guard';
import { PasswordResetModule } from '../password-reset/password-reset.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    forwardRef(() => PasswordResetModule),
    forwardRef(() => OtpModule),
  ],
  controllers: [AuthController, AuthCompatController],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy, AuthRateLimitService, TwoFaGuard],
  exports: [AuthService],
})
export class AuthModule {}
