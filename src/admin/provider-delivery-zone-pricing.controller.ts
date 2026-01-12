import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { AdminService } from './admin.service';
import { UpsertProviderDeliveryZonePricingDto } from './dto/provider-delivery-zone.dto';

@ApiTags('Admin/ProviderDeliveryZonePricing')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/providers/:providerId/delivery-zone-pricing', version: ['1'] })
export class AdminProviderDeliveryZonePricingController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async list(@Param('providerId') providerId: string, @Query('isActive') isActive?: string) {
    await this.assertProvider(providerId);
    const activeFilter =
      isActive === undefined || isActive === null
        ? undefined
        : ['true', '1', 'yes'].includes(String(isActive).toLowerCase());
    return this.admin.prisma.providerDeliveryZonePricing.findMany({
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
    @Param('providerId') providerId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpsertProviderDeliveryZonePricingDto,
  ) {
    await this.assertProvider(providerId);
    await this.assertZone(zoneId);
    const updateData: { feeCents: number; isActive?: boolean } = { feeCents: dto.feeCents };
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }
    return this.admin.prisma.providerDeliveryZonePricing.upsert({
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
  async remove(@Param('providerId') providerId: string, @Param('zoneId') zoneId: string) {
    await this.assertProvider(providerId);
    const existing = await this.admin.prisma.providerDeliveryZonePricing.findFirst({
      where: { providerId, zoneId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Pricing entry not found');
    await this.admin.prisma.providerDeliveryZonePricing.delete({
      where: { providerId_zoneId: { providerId, zoneId } },
    });
    return { ok: true };
  }

  private async assertProvider(providerId: string) {
    const provider = await this.admin.prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (!provider) {
      throw new BadRequestException('Provider not found');
    }
  }

  private async assertZone(zoneId: string) {
    const zone = await this.admin.prisma.deliveryZone.findUnique({
      where: { id: zoneId },
      select: { id: true },
    });
    if (!zone) {
      throw new BadRequestException('Delivery zone not found');
    }
  }
}
