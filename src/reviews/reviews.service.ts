import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError, ErrorCode } from '../common/errors';
import { AuditLogService } from '../common/audit/audit-log.service';
import { AdminReviewListDto, CreateReviewDto, ReviewListDto, ReviewModerateDto, UpdateReviewDto } from './dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async createReview(userId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, userId: true, providerId: true, status: true },
    });
    if (!order || order.userId !== userId) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Only delivered orders can be reviewed');
    }
    if (!order.providerId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Order provider not found');
    }
    if (dto.providerId && dto.providerId !== order.providerId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Review provider does not match order');
    }

    const existing = await this.prisma.review.findFirst({
      where: { orderId: order.id, userId },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Review already submitted');
    }

    const review = await this.prisma.review.create({
      data: {
        orderId: order.id,
        userId,
        providerId: order.providerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || undefined,
        status: ReviewStatus.PENDING,
      },
    });

    await this.audit.log({
      action: 'review.create',
      entity: 'Review',
      entityId: review.id,
      after: review,
      actorId: userId,
    });

    return review;
  }

  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, userId },
    });
    if (!review) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Review not found', 404);
    }

    const updates: Prisma.ReviewUpdateInput = {
      rating: dto.rating ?? review.rating,
      comment: dto.comment === undefined ? review.comment : dto.comment?.trim() || null,
    };

    const wasApproved = review.status === ReviewStatus.APPROVED;
    if (review.status !== ReviewStatus.PENDING) {
      updates.status = ReviewStatus.PENDING;
      updates.moderatedAt = null;
      updates.moderatedById = null;
      updates.moderationNote = null;
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: updates,
    });

    await this.audit.log({
      action: 'review.update',
      entity: 'Review',
      entityId: updated.id,
      before: review,
      after: updated,
      actorId: userId,
    });

    if (wasApproved) {
      await this.recalculateProviderRating(review.providerId);
    }

    return updated;
  }

  async getReviewForOrder(userId: string, orderId: string) {
    const review = await this.prisma.review.findFirst({
      where: { orderId, userId },
      include: {
        provider: { select: { id: true, name: true, nameAr: true } },
      },
    });
    return review;
  }

  async listProviderReviews(providerId: string, query: ReviewListDto) {
    const where: Prisma.ReviewWhereInput = {
      providerId,
      status: ReviewStatus.APPROVED,
    };
    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      ratingAvg: summary._avg.rating ?? 0,
      ratingCount: summary._count.rating ?? 0,
    };
  }

  async listAdminReviews(query: AdminReviewListDto) {
    const where: Prisma.ReviewWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status;
    if (query.rating) where.rating = query.rating;
    if (query.q) {
      where.OR = [
        { comment: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { order: { code: { contains: query.q, mode: 'insensitive' } } },
        { provider: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          provider: { select: { id: true, name: true, nameAr: true } },
          user: { select: { id: true, name: true, phone: true } },
          order: { select: { id: true, code: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async moderateReview(adminUserId: string, reviewId: string, dto: ReviewModerateDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Review not found', 404);
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: dto.status,
        moderatedAt: new Date(),
        moderatedById: adminUserId,
        moderationNote: dto.moderationNote?.trim() || null,
      },
    });

    await this.audit.log({
      action: 'review.moderate',
      entity: 'Review',
      entityId: reviewId,
      before: review,
      after: updated,
      actorId: adminUserId,
    });

    const statusChanged = review.status !== updated.status;
    if (statusChanged) {
      await this.recalculateProviderRating(review.providerId);
    }

    return updated;
  }

  private async recalculateProviderRating(providerId: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const summary = await client.review.aggregate({
      where: { providerId, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await client.provider.update({
      where: { id: providerId },
      data: {
        ratingAvg: summary._avg.rating ?? 0,
        ratingCount: summary._count.rating ?? 0,
      },
    });
  }
}
