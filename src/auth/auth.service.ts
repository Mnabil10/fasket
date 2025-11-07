import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(input: { name: string; phone: string; email?: string; password: string }) {
    const or: any[] = [{ phone: input.phone }];
    if (input.email) or.push({ email: input.email });
    const exists = await this.prisma.user.findFirst({ where: { OR: or } });
    if (exists) throw new BadRequestException('User already exists');

    const hash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: { name: input.name, phone: input.phone, email: input.email, password: hash },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    const tokens = await this.issueTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async login(input: { phone: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) throw new UnauthorizedException('Invalid phone or password');
    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid phone or password');
    const tokens = await this.issueTokens(user.id, user.role);
    const safeUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
    return { user: safeUser, ...tokens };
  }

  async issueTokens(sub: string, role: string) {
    const access = await this.jwt.signAsync({ sub, role }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: Number(process.env.JWT_ACCESS_TTL || 900) });
    const refresh = await this.jwt.signAsync({ sub }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: Number(process.env.JWT_REFRESH_TTL || 1209600) });
    return { accessToken: access, refreshToken: refresh };
  }

  async issueTokensForUserId(sub: string) {
    const user = await this.prisma.user.findUnique({ where: { id: sub }, select: { role: true } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueTokens(sub, user.role);
  }
}
