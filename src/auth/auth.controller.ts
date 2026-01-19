import { Body, Controller, Post, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions } from 'express';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
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
  constructor(
    private service: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ authRegister: {} })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const payload = await this.service.register(dto);
    this.setRefreshCookie(res, payload?.refreshToken);
    return payload;
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
  async signupVerify(@Body() dto: SignupVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = await this.service.signupVerify(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, payload?.refreshToken);
    return payload;
  }

  @Post('login')
  @Throttle({ authLogin: {} })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = await this.service.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, payload?.refreshToken);
    return payload;
  }

  @Post('login-otp')
  @Throttle({ otpVerify: {} })
  async loginOtp(@Body() dto: LoginOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = await this.service.loginWithOtp(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, payload?.refreshToken);
    return payload;
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  async refresh(@Req() req: any, @Body() _dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    // req.user is populated by JwtRefreshStrategy.validate
    const payload = await this.service.issueTokensForUserId(req.user.userId, req.user.jti);
    this.setRefreshCookie(res, payload?.refreshToken);
    return payload;
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
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const payload = await this.service.revokeRefreshToken(req.user.userId, req.user.jti);
    this.clearRefreshCookie(res);
    return payload;
  }

  private setRefreshCookie(res: Response, refreshToken?: string | null) {
    if (!refreshToken) return;
    const cookieName = this.resolveCookieName();
    res.cookie(cookieName, refreshToken, this.buildRefreshCookieOptions());
  }

  private clearRefreshCookie(res: Response) {
    const cookieName = this.resolveCookieName();
    res.clearCookie(cookieName, this.buildRefreshCookieOptions({ maxAge: 0 }));
  }

  private resolveCookieName() {
    return this.config.get<string>('AUTH_REFRESH_COOKIE_NAME') || 'refreshToken';
  }

  private buildRefreshCookieOptions(overrides: Partial<CookieOptions> = {}): CookieOptions {
    const maxAgeSeconds = this.config.get<number>('JWT_REFRESH_TTL') ?? 1209600;
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? '').toLowerCase();
    const secureEnv = this.config.get<string>('AUTH_REFRESH_COOKIE_SECURE');
    const secure = secureEnv ? secureEnv === 'true' : nodeEnv === 'production';
    const rawSameSite =
      this.config.get<string>('AUTH_REFRESH_COOKIE_SAMESITE') ??
      this.config.get<string>('AUTH_COOKIE_SAMESITE') ??
      '';
    const normalizedSameSite = rawSameSite.toLowerCase();
    let sameSite: CookieOptions['sameSite'] = 'lax';
    if (normalizedSameSite === 'none' || normalizedSameSite === 'strict' || normalizedSameSite === 'lax') {
      sameSite = normalizedSameSite as CookieOptions['sameSite'];
    } else if (secure) {
      sameSite = 'none';
    }
    if (sameSite === 'none' && !secure) {
      sameSite = 'lax';
    }
    const domain =
      this.config.get<string>('AUTH_REFRESH_COOKIE_DOMAIN') ??
      this.config.get<string>('AUTH_COOKIE_DOMAIN');
    const path =
      this.config.get<string>('AUTH_REFRESH_COOKIE_PATH') ??
      this.config.get<string>('AUTH_COOKIE_PATH') ??
      '/';

    return {
      httpOnly: true,
      secure,
      sameSite,
      path,
      ...(domain ? { domain } : {}),
      maxAge: maxAgeSeconds * 1000,
      ...overrides,
    };
  }
}
