import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async list(params?: {
    search?: string;
    isActive?: boolean;
    page?: number | string;
    pageSize?: number | string;
    limit?: number | string;
  }) {
    const where: any = {};
    if (params?.isActive !== undefined) where.isActive = params.isActive;
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

  async create(dto: CreateDriverDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateDriverDto) {
    await this.ensureDriver(id);
    try {
      return await this.prisma.deliveryDriver.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          nationalId: dto.nationalId,
          nationalIdImageUrl: dto.nationalIdImageUrl,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
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
    try {
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
    } catch (error) {
      this.handlePrismaError(error);
    }
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
      select: { id: true, userId: true, status: true, driverId: true },
    });
    if (!order) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    if (order.status === 'DELIVERED' || order.status === 'CANCELED') {
      throw new DomainError(ErrorCode.ORDER_ALREADY_COMPLETED, 'Cannot assign driver to completed order');
    }
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { driverId: driver.id, driverAssignedAt: new Date() },
      select: { id: true, userId: true, status: true, driverAssignedAt: true, driverId: true },
    });
    return { order: updatedOrder, driver };
  }

  private async ensureDriver(id: string) {
    const exists = await this.prisma.deliveryDriver.findUnique({ where: { id } });
    if (!exists) {
      throw new DomainError(ErrorCode.DRIVER_NOT_FOUND, 'Driver not found');
    }
    return exists;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const targets = this.extractTargets(error);
        if (targets.includes('phone')) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'Phone number already exists for another driver',
            HttpStatus.CONFLICT,
            { target: 'phone' },
          );
        }
        if (targets.includes('nationalId')) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'National ID already exists for another driver',
            HttpStatus.CONFLICT,
            { target: 'nationalId' },
          );
        }
        if (targets.includes('plateNumber')) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'Vehicle plate number already assigned to another driver',
            HttpStatus.CONFLICT,
            { target: 'plateNumber' },
          );
        }
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'Duplicate driver record',
          HttpStatus.CONFLICT,
          { target: targets },
        );
      }
    }
    throw error;
  }

  private extractTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
    const targetMeta = error.meta?.target;
    if (Array.isArray(targetMeta)) return targetMeta.map(String);
    if (typeof targetMeta === 'string') return [targetMeta];
    return [];
  }
}
