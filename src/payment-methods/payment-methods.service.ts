import { Injectable } from '@nestjs/common';
import { PaymentMethod, WalletProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError, ErrorCode } from '../common/errors';
import { CreatePaymentMethodDto } from './dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.savedPaymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        provider: true,
        last4: true,
        brand: true,
        expMonth: true,
        expYear: true,
        walletProvider: true,
        walletPhone: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return items;
  }

  async create(userId: string, dto: CreatePaymentMethodDto) {
    if (dto.type === PaymentMethod.COD) {
      throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Cash on delivery cannot be saved');
    }
    this.assertTokenSafe(dto.token);
    this.assertDetails(dto);

    const created = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.savedPaymentMethod.count({ where: { userId } });
      const shouldBeDefault = dto.isDefault === true || existingCount === 0;
      if (shouldBeDefault) {
        await tx.savedPaymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.savedPaymentMethod.create({
        data: {
          userId,
          type: dto.type,
          provider: dto.provider ?? null,
          token: dto.token,
          last4: dto.last4 ?? null,
          brand: dto.brand ?? null,
          expMonth: dto.expMonth ?? null,
          expYear: dto.expYear ?? null,
          walletProvider: dto.walletProvider ?? null,
          walletPhone: dto.walletPhone ?? null,
          isDefault: shouldBeDefault,
        },
      });
    });

    return {
      id: created.id,
      type: created.type,
      provider: created.provider,
      last4: created.last4,
      brand: created.brand,
      expMonth: created.expMonth,
      expYear: created.expYear,
      walletProvider: created.walletProvider,
      walletPhone: created.walletPhone,
      isDefault: created.isDefault,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async setDefault(userId: string, id: string) {
    const existing = await this.prisma.savedPaymentMethod.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Payment method not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.savedPaymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
      await tx.savedPaymentMethod.update({ where: { id }, data: { isDefault: true } });
    });
    return { ok: true };
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.savedPaymentMethod.findFirst({
      where: { id, userId },
      select: { id: true, isDefault: true },
    });
    if (!existing) {
      throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Payment method not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.savedPaymentMethod.delete({ where: { id } });
      if (existing.isDefault) {
        const fallback = await tx.savedPaymentMethod.findFirst({
          where: { userId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        if (fallback) {
          await tx.savedPaymentMethod.update({ where: { id: fallback.id }, data: { isDefault: true } });
        }
      }
    });
    return { ok: true };
  }

  private assertTokenSafe(token: string) {
    const digitsOnly = token.replace(/\D/g, '');
    const looksLikeCard = digitsOnly.length >= 12 && digitsOnly.length <= 19 && digitsOnly === token;
    if (looksLikeCard) {
      throw new DomainError(
        ErrorCode.PAYMENT_METHOD_INVALID,
        'Payment token must not contain raw card numbers',
      );
    }
  }

  private assertDetails(dto: CreatePaymentMethodDto) {
    if (dto.type === PaymentMethod.CARD) {
      if (!dto.last4 || dto.last4.length !== 4) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Card last4 is required');
      }
      if (!dto.expMonth || !dto.expYear) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Card expiry is required');
      }
      return;
    }
    if (dto.type === PaymentMethod.WALLET) {
      if (!dto.walletProvider) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Wallet provider is required');
      }
      if (!dto.walletPhone) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Wallet phone is required');
      }
      if (!Object.values(WalletProvider).includes(dto.walletProvider)) {
        throw new DomainError(ErrorCode.PAYMENT_METHOD_INVALID, 'Wallet provider is invalid');
      }
    }
  }
}
