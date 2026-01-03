import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Provider')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider', version: ['1'] })
export class ProviderController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload) {
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: true },
    });
    if (!membership?.provider) {
      throw new NotFoundException('Provider not found');
    }

    const subscription = await this.prisma.providerSubscription.findFirst({
      where: {
        providerId: membership.providerId,
        status: { in: ['TRIALING', 'ACTIVE'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      provider: membership.provider,
      membership: { role: membership.role },
      subscription,
    };
  }
}
