import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { StaffOrAdmin } from './_admin-guards';
import { DeliveryDriversService } from '../delivery-drivers/delivery-drivers.service';
import {
  CreateDriverDto,
  UpdateDriverDto,
  UpdateDriverStatusDto,
  UpsertVehicleDto,
} from '../delivery-drivers/dto/driver.dto';
import { UploadsService } from 'src/uploads/uploads.service';

@ApiTags('Admin/DeliveryDrivers')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/delivery-drivers', version: ['1'] })
export class AdminDeliveryDriversController {
  constructor(
    private readonly drivers: DeliveryDriversService,
    private readonly uploads: UploadsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  list(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.drivers.list({
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page,
      pageSize,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drivers.getById(id);
  }

  @Get(':id/location')
  getLatestLocation(@Param('id') id: string) {
    return this.drivers.getLatestLocation(id);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fullName', 'phone', 'nationalId'],
      properties: {
        fullName: { type: 'string' },
        phone: { type: 'string' },
        nationalId: { type: 'string' },
        isActive: { type: 'boolean' },
        nationalIdImage: { type: 'string', format: 'binary' },
        'vehicle.type': { type: 'string' },
        'vehicle.plateNumber': { type: 'string' },
        'vehicle.color': { type: 'string' },
        'vehicle.licenseImage': { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'nationalIdImage', maxCount: 1 },
        { name: 'vehicle.licenseImage', maxCount: 1 },
        { name: 'vehicleLicenseImage', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
        fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: (error: any, acceptFile: boolean) => void) => {
          const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
            .split(',')
            .map((s) => s.trim());
          if (file && !allowed.includes(file.mimetype)) {
            return cb(new BadRequestException('Unsupported content type') as any, false);
          }
          cb(null, true);
        },
      },
    ),
  )
  async create(
    @Body() body: any,
    @UploadedFiles()
    files: {
      nationalIdImage?: Express.Multer.File[];
      'vehicle.licenseImage'?: Express.Multer.File[];
      vehicleLicenseImage?: Express.Multer.File[];
    },
  ) {
    const payload = this.normalizeCreatePayload(body);

    const nationalIdFile = this.pickFirst(files?.nationalIdImage);
    const vehicleLicenseFile =
      this.pickFirst(files?.['vehicle.licenseImage']) ?? this.pickFirst(files?.vehicleLicenseImage);

    if (nationalIdFile) {
      this.ensureFileAllowed(nationalIdFile);
      const uploaded = await this.uploads.processImageAsset(nationalIdFile, {
        folder: 'drivers',
        generateVariants: false,
      });
      payload.nationalIdImageUrl = uploaded.url;
    }

    if (vehicleLicenseFile) {
      this.ensureFileAllowed(vehicleLicenseFile);
      const uploaded = await this.uploads.processImageAsset(vehicleLicenseFile, {
        folder: 'drivers',
        generateVariants: false,
      });
      payload.vehicle = payload.vehicle ?? {};
      payload.vehicle.licenseImageUrl = uploaded.url;
    }

    const dto = await this.validateCreateDto(payload);
    return this.drivers.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDriverStatusDto) {
    return this.drivers.updateStatus(id, dto);
  }

  @Post(':id/vehicle')
  upsertVehicle(@Param('id') id: string, @Body() dto: UpsertVehicleDto) {
    return this.drivers.upsertVehicle(id, dto);
  }

  private normalizeCreatePayload(body: any) {
    const vehicle = this.extractVehicle(body);
    return {
      fullName: body.fullName,
      phone: body.phone,
      nationalId: body.nationalId,
      nationalIdImageUrl: body.nationalIdImageUrl,
      isActive: body.isActive,
      ...(vehicle ? { vehicle } : {}),
    };
  }

  private extractVehicle(body: any): Partial<UpsertVehicleDto> | undefined {
    const type = body['vehicle.type'] ?? body.vehicleType ?? body?.vehicle?.type;
    const plateNumber = body['vehicle.plateNumber'] ?? body.vehiclePlateNumber ?? body?.vehicle?.plateNumber;
    const color = body['vehicle.color'] ?? body.vehicleColor ?? body?.vehicle?.color;
    const licenseImageUrl =
      body['vehicle.licenseImageUrl'] ??
      body.vehicleLicenseImageUrl ??
      body?.vehicle?.licenseImageUrl;

    if ([type, plateNumber, color, licenseImageUrl].every((v) => v === undefined)) return undefined;
    return { type, plateNumber, color, licenseImageUrl };
  }

  private pickFirst(files?: Express.Multer.File[]) {
    return Array.isArray(files) && files.length ? files[0] : undefined;
  }

  private ensureFileAllowed(file: Express.Multer.File) {
    const maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is empty');
    }
    if (file.size > maxBytes) {
      throw new BadRequestException(`File too large (max ${maxBytes} bytes)`);
    }
    const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((s) => s.trim());
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported content type');
    }
  }

  private async validateCreateDto(payload: any): Promise<CreateDriverDto> {
    const dto = plainToInstance(CreateDriverDto, payload, { enableImplicitConversion: true });
    try {
      await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
      return dto;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }
}
