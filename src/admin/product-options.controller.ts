import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { Prisma, ProductOptionGroupPriceMode, ProviderStatus, UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { ProviderOrStaffOrAdmin } from './_admin-guards';
import {
  CreateProductOptionDto,
  CreateProductOptionGroupDto,
  AttachProductOptionGroupDto,
  UpdateProductOptionDto,
  UpdateProductOptionGroupDto,
} from './dto/product-options.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { ProductOptionsBulkService } from './product-options-bulk.service';

@ApiTags('Admin/ProductOptions')
@ApiBearerAuth()
@ProviderOrStaffOrAdmin()
@Controller({ path: 'admin', version: ['1'] })
export class AdminProductOptionsController {
  constructor(
    private readonly admin: AdminService,
    private readonly bulk: ProductOptionsBulkService,
  ) {}

  @Get('products/:productId/option-groups')
  async listGroups(@CurrentUser() user: CurrentUserPayload, @Param('productId') productId: string) {
    const providerScope = await this.resolveProviderScope(user);
    await this.assertProductAccess(productId, providerScope);
    return this.admin.prisma.productOptionGroup.findMany({
      where: { products: { some: { id: productId } } },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('products/:productId/option-groups/available')
  async listAvailableGroups(@CurrentUser() user: CurrentUserPayload, @Param('productId') productId: string) {
    const providerScope = await this.resolveProviderScope(user);
    const product = await this.assertProductAccess(productId, providerScope);
    const providerId = product.providerId ?? null;
    const where: Prisma.ProductOptionGroupWhereInput = {
      products: { some: { providerId } },
      NOT: { products: { some: { id: productId } } },
    };
    return this.admin.prisma.productOptionGroup.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('products/:productId/option-groups')
  async createGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Body() dto: CreateProductOptionGroupDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    await this.assertProductAccess(productId, providerScope);
    this.validateGroupRules(dto.type, dto.minSelected, dto.maxSelected, dto.priceMode);
    return this.admin.prisma.productOptionGroup.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr ?? null,
        type: dto.type,
        priceMode: dto.priceMode ?? ProductOptionGroupPriceMode.ADD,
        minSelected: dto.minSelected ?? 0,
        maxSelected: dto.maxSelected ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        products: { connect: { id: productId } },
      },
    });
  }

  @Post('products/:productId/option-groups/attach')
  async attachGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Body() dto: AttachProductOptionGroupDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const product = await this.assertProductAccess(productId, providerScope);
    const group = await this.admin.prisma.productOptionGroup.findUnique({
      where: { id: dto.groupId },
      include: { products: { select: { id: true, providerId: true } } },
    });
    if (!group) throw new NotFoundException('Option group not found');

    const providerIds = new Set(group.products.map((p) => p.providerId ?? null));
    if (providerIds.size > 1) {
      throw new BadRequestException('Option group belongs to multiple providers');
    }
    const groupProviderId = providerIds.size ? Array.from(providerIds)[0] : null;
    const productProviderId = product.providerId ?? null;
    if (groupProviderId !== null && groupProviderId !== productProviderId) {
      throw new BadRequestException('Option group belongs to another provider');
    }
    if (group.products.some((p) => p.id === productId)) {
      return { ok: true, attached: false };
    }
    await this.admin.prisma.productOptionGroup.update({
      where: { id: dto.groupId },
      data: { products: { connect: { id: productId } } },
    });
    return { ok: true, attached: true };
  }

  @Delete('products/:productId/option-groups/:groupId')
  async detachGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    await this.assertProductAccess(productId, providerScope);
    const group = await this.admin.prisma.productOptionGroup.findFirst({
      where: { id: groupId, products: { some: { id: productId } } },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Option group not found');
    await this.admin.prisma.productOptionGroup.update({
      where: { id: groupId },
      data: { products: { disconnect: { id: productId } } },
    });
    return { ok: true };
  }

  @Get('product-option-groups/:groupId/options-template')
  @ApiOkResponse({
    description: 'Excel template containing the required header row',
    schema: { type: 'string', format: 'binary' },
  })
  async downloadOptionsTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    await this.assertGroupAccess(groupId, providerScope);
    const buffer = this.bulk.generateTemplate();
    return new StreamableFile(buffer, {
      disposition: 'attachment; filename="option-groups-template.xlsx"',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  @Post('product-option-groups/:groupId/options-upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Summary of created, updated, and failed rows',
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async bulkUploadOptions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024, message: 'File must not exceed 5MB' }),
          new FileTypeValidator({ fileType: /(csv|excel|spreadsheetml)/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    await this.assertGroupAccess(groupId, providerScope);
    return this.bulk.processUpload(file, groupId, { dryRun: String(dryRun).toLowerCase() === 'true' });
  }

  @Patch('product-option-groups/:groupId')
  async updateGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateProductOptionGroupDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerScope);
    if (!group) throw new NotFoundException('Option group not found');
    const nextType = dto.type ?? group.type;
    const nextMin = dto.minSelected ?? group.minSelected;
    const nextMax = dto.maxSelected ?? group.maxSelected ?? null;
    const nextPriceMode = dto.priceMode ?? group.priceMode ?? ProductOptionGroupPriceMode.ADD;
    this.validateGroupRules(nextType, nextMin, nextMax, nextPriceMode);
    return this.admin.prisma.productOptionGroup.update({
      where: { id: groupId },
      data: {
        name: dto.name?.trim(),
        nameAr: dto.nameAr,
        type: dto.type,
        priceMode: dto.priceMode,
        minSelected: dto.minSelected,
        maxSelected: dto.maxSelected,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  @Delete('product-option-groups/:groupId')
  async deleteGroup(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    const providerScope = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerScope);
    if (!group) throw new NotFoundException('Option group not found');
    await this.admin.prisma.productOptionGroup.delete({ where: { id: groupId } });
    return { ok: true };
  }

  @Post('product-option-groups/:groupId/options')
  async createOption(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: CreateProductOptionDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerScope);
    if (!group) throw new NotFoundException('Option group not found');
    return this.admin.prisma.productOption.create({
      data: {
        groupId,
        name: dto.name.trim(),
        nameAr: dto.nameAr ?? null,
        priceCents: dto.priceCents ?? 0,
        maxQtyPerOption: dto.maxQtyPerOption ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch('product-options/:optionId')
  async updateOption(
    @CurrentUser() user: CurrentUserPayload,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateProductOptionDto,
  ) {
    const providerScope = await this.resolveProviderScope(user);
    const option = await this.getOption(optionId, providerScope);
    if (!option) throw new NotFoundException('Option not found');
    return this.admin.prisma.productOption.update({
      where: { id: optionId },
      data: {
        name: dto.name?.trim(),
        nameAr: dto.nameAr,
        priceCents: dto.priceCents,
        maxQtyPerOption: dto.maxQtyPerOption,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  @Delete('product-options/:optionId')
  async deleteOption(@CurrentUser() user: CurrentUserPayload, @Param('optionId') optionId: string) {
    const providerScope = await this.resolveProviderScope(user);
    const option = await this.getOption(optionId, providerScope);
    if (!option) throw new NotFoundException('Option not found');
    await this.admin.prisma.productOption.delete({ where: { id: optionId } });
    return { ok: true };
  }

  private validateGroupRules(
    type: string,
    minSelected?: number | null,
    maxSelected?: number | null,
    priceMode: ProductOptionGroupPriceMode = ProductOptionGroupPriceMode.ADD,
  ) {
    const min = minSelected ?? 0;
    const max = maxSelected ?? null;
    if (max !== null && max < min) {
      throw new BadRequestException('maxSelected must be greater than or equal to minSelected');
    }
    if (type === 'SINGLE') {
      if (min > 1) {
        throw new BadRequestException('Single choice groups cannot require more than one selection');
      }
      if (max !== null && max > 1) {
        throw new BadRequestException('Single choice groups cannot allow more than one selection');
      }
    } else if (priceMode === ProductOptionGroupPriceMode.SET) {
      throw new BadRequestException('Price override groups must be single choice');
    }
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
    const membership = await this.admin.prisma.providerUser.findFirst({
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

  private async assertProductAccess(productId: string, providerScope: string | null) {
    const product = await this.admin.prisma.product.findFirst({
      where: { id: productId, ...(providerScope ? { providerId: providerScope } : {}) },
      select: { id: true, providerId: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private getGroup(groupId: string, providerScope: string | null) {
    const where: Prisma.ProductOptionGroupWhereInput = {
      id: groupId,
      ...(providerScope ? { products: { some: { providerId: providerScope } } } : {}),
    };
    return this.admin.prisma.productOptionGroup.findFirst({ where });
  }

  private getOption(optionId: string, providerScope: string | null) {
    const where: Prisma.ProductOptionWhereInput = {
      id: optionId,
      ...(providerScope ? { group: { products: { some: { providerId: providerScope } } } } : {}),
    };
    return this.admin.prisma.productOption.findFirst({ where });
  }

  private async assertGroupAccess(groupId: string, providerScope: string | null) {
    const group = await this.getGroup(groupId, providerScope);
    if (!group) throw new NotFoundException('Option group not found');
    return group;
  }
}
