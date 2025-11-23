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
exports.DeliveryDriversService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
let DeliveryDriversService = class DeliveryDriversService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(params) {
        const where = {};
        if (params?.isActive !== undefined)
            where.isActive = params.isActive;
        if (params?.search) {
            where.OR = [
                { fullName: { contains: params.search, mode: 'insensitive' } },
                { phone: { contains: params.search, mode: 'insensitive' } },
                { nationalId: { contains: params.search, mode: 'insensitive' } },
            ];
        }
        const rawPage = Number(params?.page ?? 1);
        const rawSize = Number(params?.pageSize ?? params?.limit ?? 20);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
        const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(Math.floor(rawSize), 100) : 20;
        const skip = (page - 1) * pageSize;
        const [items, total] = await this.prisma.$transaction([
            this.prisma.deliveryDriver.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: { vehicle: true },
                skip,
                take: pageSize,
            }),
            this.prisma.deliveryDriver.count({ where }),
        ]);
        return { items, total, page, pageSize };
    }
    async getById(id) {
        const driver = await this.prisma.deliveryDriver.findUnique({
            where: { id },
            include: { vehicle: true },
        });
        if (!driver) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
        }
        return driver;
    }
    create(dto) {
        return this.prisma.$transaction(async (tx) => {
            const driver = await tx.deliveryDriver.create({
                data: {
                    fullName: dto.fullName,
                    phone: dto.phone,
                    nationalId: dto.nationalId,
                    nationalIdImageUrl: dto.nationalIdImageUrl,
                    isActive: dto.isActive ?? true,
                },
            });
            if (dto.vehicle) {
                await tx.deliveryVehicle.upsert({
                    where: { driverId: driver.id },
                    update: {
                        type: dto.vehicle.type,
                        plateNumber: dto.vehicle.plateNumber,
                        licenseImageUrl: dto.vehicle.licenseImageUrl,
                        color: dto.vehicle.color,
                    },
                    create: {
                        driverId: driver.id,
                        type: dto.vehicle.type,
                        plateNumber: dto.vehicle.plateNumber,
                        licenseImageUrl: dto.vehicle.licenseImageUrl,
                        color: dto.vehicle.color,
                    },
                });
            }
            return tx.deliveryDriver.findUnique({
                where: { id: driver.id },
                include: { vehicle: true },
            });
        });
    }
    async update(id, dto) {
        await this.ensureDriver(id);
        return this.prisma.deliveryDriver.update({
            where: { id },
            data: {
                fullName: dto.fullName,
                phone: dto.phone,
                nationalId: dto.nationalId,
                nationalIdImageUrl: dto.nationalIdImageUrl,
                isActive: dto.isActive,
            },
        });
    }
    async updateStatus(id, dto) {
        await this.ensureDriver(id);
        return this.prisma.deliveryDriver.update({
            where: { id },
            data: { isActive: dto.isActive },
        });
    }
    async upsertVehicle(driverId, dto) {
        await this.ensureDriver(driverId);
        await this.prisma.deliveryVehicle.upsert({
            where: { driverId },
            update: {
                type: dto.type,
                plateNumber: dto.plateNumber,
                licenseImageUrl: dto.licenseImageUrl,
                color: dto.color,
            },
            create: {
                driverId,
                type: dto.type,
                plateNumber: dto.plateNumber,
                licenseImageUrl: dto.licenseImageUrl,
                color: dto.color,
            },
        });
        return this.prisma.deliveryDriver.findUnique({
            where: { id: driverId },
            include: { vehicle: true },
        });
    }
    async assignDriverToOrder(orderId, driverId) {
        const driver = await this.prisma.deliveryDriver.findUnique({
            where: { id: driverId },
            select: { id: true, fullName: true, phone: true, isActive: true },
        });
        if (!driver) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
        }
        if (!driver.isActive) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_INACTIVE, 'Driver is inactive');
        }
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, userId: true, status: true, driverId: true },
        });
        if (!order) {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_NOT_FOUND, 'Order not found');
        }
        if (order.status === 'DELIVERED' || order.status === 'CANCELED') {
            throw new errors_1.DomainError(errors_1.ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
        }
        const updatedOrder = await this.prisma.order.update({
            where: { id: orderId },
            data: { driverId: driver.id, driverAssignedAt: new Date() },
            select: { id: true, userId: true, status: true, driverAssignedAt: true, driverId: true },
        });
        return { order: updatedOrder, driver };
    }
    async ensureDriver(id) {
        const exists = await this.prisma.deliveryDriver.findUnique({ where: { id } });
        if (!exists) {
            throw new errors_1.DomainError(errors_1.ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
        }
        return exists;
    }
};
exports.DeliveryDriversService = DeliveryDriversService;
exports.DeliveryDriversService = DeliveryDriversService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DeliveryDriversService);
//# sourceMappingURL=delivery-drivers.service.js.map