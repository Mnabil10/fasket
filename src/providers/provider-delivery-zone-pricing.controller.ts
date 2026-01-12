import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProviderStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProviderDeliveryZonePricingDto } from '../admin/dto/provider-delivery-zone.dto';

@ApiTags('Provider/DeliveryZonePricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider/delivery-zone-pricing', version: ['1'] })
export class ProviderDeliveryZonePricingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async list(@CurrentUser() user: CurrentUserPayload, @Query('isActive') isActive?: string) {
    const providerId = await this.resolveProviderScope(user);
    const activeFilter =
      isActive === undefined || isActive === null
        ? undefined
        : ['true', '1', 'yes'].includes(String(isActive).toLowerCase());
    return this.prisma.providerDeliveryZonePricing.findMany({
      where: {
        providerId,
        ...(activeFilter === undefined ? {} : { isActive: activeFilter }),
      },
      include: { zone: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Put(':zoneId')
  async upsert(
    @CurrentUser() user: CurrentUserPayload,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpsertProviderDeliveryZonePricingDto,
  ) {
    const providerId = await this.resolveProviderScope(user);
    await this.assertZone(zoneId);
    const updateData: { feeCents: number; isActive?: boolean } = { feeCents: dto.feeCents };
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }
    return this.prisma.providerDeliveryZonePricing.upsert({
      where: { providerId_zoneId: { providerId, zoneId } },
      update: updateData,
      create: {
        providerId,
        zoneId,
        feeCents: dto.feeCents,
        isActive: dto.isActive ?? true,
      },
      include: { zone: true },
    });
  }

  @Delete(':zoneId')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('zoneId') zoneId: string) {
    const providerId = await this.resolveProviderScope(user);
    const existing = await this.prisma.providerDeliveryZonePricing.findFirst({
      where: { providerId, zoneId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Pricing entry not found');
    await this.prisma.providerDeliveryZonePricing.delete({
      where: { providerId_zoneId: { providerId, zoneId } },
    });
    return { ok: true };
  }

  private async resolveProviderScope(user?: CurrentUserPayload): Promise<string> {
    if (!user || user.role !== UserRole.PROVIDER) {
      throw new BadRequestException('Provider account is not linked');
    }
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId: user.userId },
      include: { provider: { select: { status: true } } },
    });
    if (!membership) {
      throw new BadRequestException('Provider account is not linked');
    }
    if (membership.provider.status !== ProviderStatus.ACTIVE) {
      throw new BadRequestException('Provider account is not active');
    }
    return membership.providerId;
  }

  private async assertZone(zoneId: string) {
    const zone = await this.prisma.deliveryZone.findUnique({
      where: { id: zoneId },
      select: { id: true },
    });
    if (!zone) {
      throw new BadRequestException('Delivery zone not found');
    }
  }
}
