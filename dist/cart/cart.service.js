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
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const image_util_1 = require("../uploads/image.util");
const localize_util_1 = require("../common/utils/localize.util");
let CartService = class CartService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureCart(userId) {
        let cart = await this.prisma.cart.findUnique({ where: { userId } });
        if (!cart) {
            cart = await this.prisma.cart.create({ data: { userId } });
        }
        return cart;
    }
    async get(userId, lang) {
        const cart = await this.ensureCart(userId);
        return this.buildCartResponse(cart.id, lang);
    }
    async add(userId, dto, lang) {
        if (dto.qty < 1) {
            throw new common_1.BadRequestException('Quantity must be at least 1');
        }
        const cart = await this.ensureCart(userId);
        const product = await this.prisma.product.findFirst({
            where: { id: dto.productId, status: client_1.ProductStatus.ACTIVE, deletedAt: null },
        });
        if (!product) {
            throw new common_1.BadRequestException('Product unavailable');
        }
        if (product.stock < dto.qty) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        const existing = await this.prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
        });
        const desiredQty = (existing?.qty ?? 0) + dto.qty;
        if (desiredQty > product.stock) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        const price = product.salePriceCents ?? product.priceCents;
        await this.prisma.cartItem.upsert({
            where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
            update: { qty: { increment: dto.qty }, priceCents: price },
            create: { cartId: cart.id, productId: dto.productId, qty: dto.qty, priceCents: price },
        });
        return this.buildCartResponse(cart.id, lang);
    }
    async updateQty(userId, id, qty, lang) {
        if (qty < 0)
            qty = 0;
        const cart = await this.ensureCart(userId);
        const item = await this.prisma.cartItem.findFirst({
            where: { id, cartId: cart.id },
            include: { product: true },
        });
        if (!item) {
            throw new common_1.BadRequestException('Item not found');
        }
        if (!item.product || item.product.deletedAt || item.product.status !== client_1.ProductStatus.ACTIVE) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
            throw new common_1.BadRequestException('Product unavailable');
        }
        if (qty === 0) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
            return this.buildCartResponse(cart.id, lang);
        }
        const availableStock = item.product.stock ?? 0;
        if (qty > availableStock) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        const price = item.product.salePriceCents ?? item.product.priceCents ?? item.priceCents;
        await this.prisma.cartItem.update({
            where: { id: item.id },
            data: { qty, priceCents: price },
        });
        return this.buildCartResponse(cart.id, lang);
    }
    async remove(userId, id, lang) {
        const cart = await this.ensureCart(userId);
        await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
        return this.buildCartResponse(cart.id, lang);
    }
    async buildCartResponse(cartId, lang) {
        const items = await this.prisma.cartItem.findMany({
            where: { cartId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true,
                        imageUrl: true,
                        priceCents: true,
                        salePriceCents: true,
                        stock: true,
                        deletedAt: true,
                        status: true,
                    },
                },
            },
            orderBy: { id: 'asc' },
        });
        const orphanIds = items
            .filter((item) => !item.product ||
            item.product.deletedAt ||
            item.product.status !== client_1.ProductStatus.ACTIVE)
            .map((item) => item.id);
        if (orphanIds.length) {
            await this.prisma.cartItem.deleteMany({ where: { id: { in: orphanIds } } });
        }
        const validItems = items.filter((item) => item.product &&
            !item.product.deletedAt &&
            item.product.status === client_1.ProductStatus.ACTIVE);
        const serializedItems = await Promise.all(validItems.map(async (item) => {
            const product = item.product;
            const effectivePrice = product.salePriceCents ?? product.priceCents;
            const localizedName = (0, localize_util_1.localize)(product.name, product.nameAr, lang);
            return {
                id: item.id,
                cartId: item.cartId,
                productId: item.productId,
                qty: item.qty,
                priceCents: effectivePrice,
                product: {
                    id: product.id,
                    name: localizedName,
                    nameAr: product.nameAr,
                    imageUrl: await (0, image_util_1.toPublicImageUrl)(product.imageUrl),
                    priceCents: product.priceCents,
                    salePriceCents: product.salePriceCents,
                },
            };
        }));
        const subtotalCents = serializedItems.reduce((total, line) => total + line.priceCents * line.qty, 0);
        return { cartId, items: serializedItems, subtotalCents };
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CartService);
//# sourceMappingURL=cart.service.js.map