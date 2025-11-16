import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto';

@ApiTags('Auth')
@Controller({ path: 'auth', version: ['1', '2'] })
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('register')
  @Throttle({ authRegister: {} })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Post('login')
  @Throttle({ authLogin: {} })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.service.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  refresh(@Req() req: any, @Body() _dto: RefreshDto) {
    // req.user is populated by JwtRefreshStrategy.validate
    return this.service.issueTokensForUserId(req.user.userId);
  }
}
