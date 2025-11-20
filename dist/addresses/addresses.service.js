"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
let AddressesService = class AddressesService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    async list(userId) {
        const addresses = await this.prisma.address.findMany({
            where: { userId },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        return this.attachZoneMetadata(addresses);
    }
    async create(userId, dto) {
        const zone = await this.settings.getZoneById(dto.zoneId);
        if (!zone) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_INVALID_ZONE, 'Selected delivery zone is invalid or inactive');
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
    async update(userId, id, dto) {
        const existing = await this.prisma.address.findFirst({ where: { id, userId } });
        if (!existing) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_NOT_FOUND, 'Address not found');
        }
        if (dto.zoneId) {
            const zone = await this.settings.getZoneById(dto.zoneId);
            if (!zone) {
                throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_INVALID_ZONE, 'Selected delivery zone is invalid or inactive');
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
                }
                else {
                    await tx.address.update({ where: { id }, data: { isDefault: true } });
                }
            }
            return next;
        });
        const [address] = await this.attachZoneMetadata([updated]);
        return address;
    }
    async remove(userId, id) {
        const existing = await this.prisma.address.findFirst({ where: { id, userId } });
        if (!existing) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ADDRESS_NOT_FOUND, 'Address not found');
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
    async attachZoneMetadata(addresses) {
        if (!addresses.length)
            return [];
        const zones = await this.settings.getDeliveryZones();
        const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));
        return addresses.map((address) => ({
            ...address,
            deliveryZone: zoneMap.get(address.zoneId) ?? null,
        }));
    }
};
exports.AddressesService = AddressesService;
exports.AddressesService = AddressesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService])
], AddressesService);
//# sourceMappingURL=addresses.service.js.map