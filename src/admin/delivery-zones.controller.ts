import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './_admin-guards';
import { SettingsService } from '../settings/settings.service';
import { PaginationDto } from './dto/pagination.dto';
import { CreateDeliveryZoneDto, UpdateDeliveryZoneDto, ListDeliveryZonesQueryDto } from './dto/delivery-zone.dto';
import { DomainError, ErrorCode } from '../common/errors';

@ApiTags('Admin/DeliveryZones')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/settings/zones', version: ['1'] })
export class AdminDeliveryZonesController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  list(@Query() query: ListDeliveryZonesQueryDto) {
    return this.settings.listZones({
      search: query.search?.trim() || undefined,
      isActive: query.isActive,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const zone = await this.settings.getZoneById(id, { includeInactive: true });
    if (!zone) {
      throw new DomainError(ErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found');
    }
    return zone;
  }

  @Post()
  create(@Body() dto: CreateDeliveryZoneDto) {
    return this.settings.createZone({
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      city: dto.city,
      region: dto.region,
      feeCents: dto.feeCents,
      etaMinutes: dto.etaMinutes,
      freeDeliveryThresholdCents: dto.freeDeliveryThresholdCents,
      minOrderAmountCents: dto.minOrderAmountCents,
      isActive: dto.isActive,
    });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.settings.updateZone(id, {
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      city: dto.city,
      region: dto.region,
      feeCents: dto.feeCents,
      etaMinutes: dto.etaMinutes,
      freeDeliveryThresholdCents: dto.freeDeliveryThresholdCents,
      minOrderAmountCents: dto.minOrderAmountCents,
      isActive: dto.isActive,
    });
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.settings.deleteZone(id);
    return { success: true };
  }
}
