import { Injectable } from '@nestjs/common';
import { Address } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { DomainError, ErrorCode } from '../common/errors';

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return this.attachZoneMetadata(addresses);
  }

  async create(userId: string, dto: CreateAddressDto) {
    const zone = await this.settings.getZoneById(dto.zoneId);
    if (!zone) {
      throw new DomainError(ErrorCode.ADDRESS_INVALID_ZONE, 'Selected delivery zone is invalid or inactive');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });
      const shouldBeDefault = dto.isDefault === true || existingCount === 0;
      if (shouldBeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          zoneId: zone.id,
          label: dto.label,
          city: dto.city,
          street: dto.street,
          building: dto.building,
          apartment: dto.apartment,
          notes: dto.notes,
          lat: dto.lat,
          lng: dto.lng,
          isDefault: shouldBeDefault,
        },
      });
    });
    const [address] = await this.attachZoneMetadata([created]);
    return address;
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Address not found');
    }
    if (dto.zoneId) {
      const zone = await this.settings.getZoneById(dto.zoneId);
      if (!zone) {
        throw new DomainError(ErrorCode.ADDRESS_INVALID_ZONE, 'Selected delivery zone is invalid or inactive');
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({ where: { userId, NOT: { id } }, data: { isDefault: false } });
      }
      const next = await tx.address.update({
        where: { id },
        data: {
          zoneId: dto.zoneId ?? existing.zoneId,
          label: dto.label ?? existing.label,
          city: dto.city ?? existing.city,
          street: dto.street ?? existing.street,
          building: dto.building ?? existing.building,
          apartment: dto.apartment ?? existing.apartment,
          notes: dto.notes ?? existing.notes,
          lat: dto.lat ?? existing.lat,
          lng: dto.lng ?? existing.lng,
          isDefault: dto.isDefault ?? existing.isDefault,
        },
      });
      if (existing.isDefault && dto.isDefault === false) {
        const fallback = await tx.address.findFirst({
          where: { userId, NOT: { id } },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        if (fallback) {
          await tx.address.update({ where: { id: fallback.id }, data: { isDefault: true } });
        } else {
          await tx.address.update({ where: { id }, data: { isDefault: true } });
        }
      }
      return next;
    });
    const [address] = await this.attachZoneMetadata([updated]);
    return address;
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new DomainError(ErrorCode.ADDRESS_NOT_FOUND, 'Address not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const fallback = await tx.address.findFirst({
          where: { userId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        if (fallback) {
          await tx.address.update({ where: { id: fallback.id }, data: { isDefault: true } });
        }
      }
    });
    return { ok: true };
  }

  private async attachZoneMetadata(addresses: Address[]) {
    if (!addresses.length) return [];
    const zones = await this.settings.getDeliveryZones();
    const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));
    return addresses.map((address) => ({
      ...address,
      deliveryZone: zoneMap.get(address.zoneId) ?? null,
    }));
  }
}
