import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  LoginDto,
  LoginOtpDto,
  RefreshDto,
  RegisterDto,
  ProviderRegisterDto,
  SignupStartDto,
  SignupVerifyDto,
  VerifyTwoFaDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Auth')
@Controller({ path: 'auth', version: ['1', '2'] })
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('register')
  @Throttle({ authRegister: {} })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Post('provider/register')
  @Throttle({ authRegister: {} })
  registerProvider(@Body() dto: ProviderRegisterDto) {
    return this.service.registerProvider(dto);
  }

  @Post('signup/start')
  @Throttle({ authRegister: {} })
  signupStart(@Body() dto: SignupStartDto, @Req() req: Request) {
    return this.service.signupStart(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('signup/verify')
  @Throttle({ otpVerify: {} })
  signupVerify(@Body() dto: SignupVerifyDto, @Req() req: Request) {
    return this.service.signupVerify(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login')
  @Throttle({ authLogin: {} })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.service.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login-otp')
  @Throttle({ otpVerify: {} })
  loginOtp(@Body() dto: LoginOtpDto, @Req() req: Request) {
    return this.service.loginWithOtp(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  refresh(@Req() req: any, @Body() _dto: RefreshDto) {
    // req.user is populated by JwtRefreshStrategy.validate
    return this.service.issueTokensForUserId(req.user.userId, req.user.jti);
  }

  @Post('admin/setup-2fa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  setupAdminTwoFa(@Req() req: any) {
    return this.service.setupAdminTwoFa(req.user.userId);
  }

  @Post('admin/enable-2fa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  enableAdminTwoFa(@Req() req: any, @Body() dto: VerifyTwoFaDto) {
    return this.service.enableAdminTwoFa(req.user.userId, dto.otp);
  }

  @Post('admin/disable-2fa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  disableAdminTwoFa(@Req() req: any) {
    return this.service.disableAdminTwoFa(req.user.userId);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt-refresh'))
  logout(@Req() req: any) {
    return this.service.revokeRefreshToken(req.user.userId, req.user.jti);
  }
}
