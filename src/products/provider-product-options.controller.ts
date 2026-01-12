import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, ProviderStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductOptionDto,
  CreateProductOptionGroupDto,
  UpdateProductOptionDto,
  UpdateProductOptionGroupDto,
} from '../admin/dto/product-options.dto';

@ApiTags('Provider/ProductOptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROVIDER')
@Controller({ path: 'provider', version: ['1'] })
export class ProviderProductOptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('products/:productId/option-groups')
  async listGroups(@CurrentUser() user: CurrentUserPayload, @Param('productId') productId: string) {
    const providerId = await this.resolveProviderScope(user);
    await this.assertProductAccess(productId, providerId);
    return this.prisma.productOptionGroup.findMany({
      where: { productId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('products/:productId/option-groups')
  async createGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('productId') productId: string,
    @Body() dto: CreateProductOptionGroupDto,
  ) {
    const providerId = await this.resolveProviderScope(user);
    await this.assertProductAccess(productId, providerId);
    this.validateGroupRules(dto.type, dto.minSelected, dto.maxSelected);
    return this.prisma.productOptionGroup.create({
      data: {
        productId,
        name: dto.name.trim(),
        nameAr: dto.nameAr ?? null,
        type: dto.type,
        minSelected: dto.minSelected ?? 0,
        maxSelected: dto.maxSelected ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch('product-option-groups/:groupId')
  async updateGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateProductOptionGroupDto,
  ) {
    const providerId = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerId);
    if (!group) throw new NotFoundException('Option group not found');
    const nextType = dto.type ?? group.type;
    const nextMin = dto.minSelected ?? group.minSelected;
    const nextMax = dto.maxSelected ?? group.maxSelected ?? null;
    this.validateGroupRules(nextType, nextMin, nextMax);
    return this.prisma.productOptionGroup.update({
      where: { id: groupId },
      data: {
        name: dto.name?.trim(),
        nameAr: dto.nameAr,
        type: dto.type,
        minSelected: dto.minSelected,
        maxSelected: dto.maxSelected,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  @Delete('product-option-groups/:groupId')
  async deleteGroup(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    const providerId = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerId);
    if (!group) throw new NotFoundException('Option group not found');
    await this.prisma.productOptionGroup.delete({ where: { id: groupId } });
    return { ok: true };
  }

  @Post('product-option-groups/:groupId/options')
  async createOption(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: CreateProductOptionDto,
  ) {
    const providerId = await this.resolveProviderScope(user);
    const group = await this.getGroup(groupId, providerId);
    if (!group) throw new NotFoundException('Option group not found');
    return this.prisma.productOption.create({
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
    const providerId = await this.resolveProviderScope(user);
    const option = await this.getOption(optionId, providerId);
    if (!option) throw new NotFoundException('Option not found');
    return this.prisma.productOption.update({
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
    const providerId = await this.resolveProviderScope(user);
    const option = await this.getOption(optionId, providerId);
    if (!option) throw new NotFoundException('Option not found');
    await this.prisma.productOption.delete({ where: { id: optionId } });
    return { ok: true };
  }

  private validateGroupRules(type: string, minSelected?: number | null, maxSelected?: number | null) {
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
    }
  }

  private async resolveProviderScope(user?: CurrentUserPayload) {
    if (!user || user.role !== UserRole.PROVIDER) return null;
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

  private async assertProductAccess(productId: string, providerId: string | null) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...(providerId ? { providerId } : {}) },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private getGroup(groupId: string, providerId: string | null) {
    const where: Prisma.ProductOptionGroupWhereInput = {
      id: groupId,
      ...(providerId ? { product: { providerId } } : {}),
    };
    return this.prisma.productOptionGroup.findFirst({ where });
  }

  private getOption(optionId: string, providerId: string | null) {
    const where: Prisma.ProductOptionWhereInput = {
      id: optionId,
      ...(providerId ? { group: { product: { providerId } } } : {}),
    };
    return this.prisma.productOption.findFirst({ where });
  }
}
