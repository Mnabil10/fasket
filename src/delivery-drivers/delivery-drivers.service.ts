import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDriverDto,
  UpdateDriverDto,
  UpdateDriverStatusDto,
  UpsertVehicleDto,
} from './dto/driver.dto';
import { DomainError, ErrorCode } from '../common/errors';

@Injectable()
export class DeliveryDriversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) {
    const where: any = {};
    if (params?.isActive !== undefined) where.isActive = params.isActive;
    if (params?.search) {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { nationalId: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const pageSize = Math.min(params?.pageSize ?? 20, 100);
    const page = Math.max(params?.page ?? 1, 1);
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

  async getById(id: string) {
    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id },
      include: { vehicle: true },
    });
    if (!driver) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
    }
    return driver;
  }

  create(dto: CreateDriverDto) {
    return this.prisma.deliveryDriver.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        nationalId: dto.nationalId,
        nationalIdImageUrl: dto.nationalIdImageUrl,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateDriverDto) {
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

  async updateStatus(id: string, dto: UpdateDriverStatusDto) {
    await this.ensureDriver(id);
    return this.prisma.deliveryDriver.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  async upsertVehicle(driverId: string, dto: UpsertVehicleDto) {
    await this.ensureDriver(driverId);
    return this.prisma.deliveryVehicle.upsert({
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
  }

  async assignDriverToOrder(orderId: string, driverId: string) {
    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id: driverId },
      select: { id: true, fullName: true, phone: true, isActive: true },
    });
    if (!driver) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
    }
    if (!driver.isActive) {
      throw new DomainError(ErrorCode.DRIVER_INACTIVE, 'Driver is inactive');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    if (order.status === 'DELIVERED' || order.status === 'CANCELED') {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { driverId: driver.id, driverAssignedAt: new Date() },
    });
    return { order, driver };
  }

  private async ensureDriver(id: string) {
    const exists = await this.prisma.deliveryDriver.findUnique({ where: { id } });
    if (!exists) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
    }
    return exists;
  }
}
